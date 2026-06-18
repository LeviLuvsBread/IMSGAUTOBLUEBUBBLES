-- =====================================================================
--  IMSGAUTOBLUEBUBBLES — AI conversational agent (additive to 0001)
--
--  Adds the multi-stage reply pipeline + conversation lifecycle:
--   * `conversation_state` — per-chat AI state machine + lifecycle funnel.
--   * `ai_stages`          — the editable per-reply pipeline (stages each with
--                            their own model + prompt + block power).
--   * `ai_runs`            — audit trace of every pipeline execution.
--   * `notifications`      — dashboard handover / escalation / opt-out alerts.
--   * app_settings / messages get additive AI columns.
--   * `claim_next_send()` re-created with ONE extra predicate so held AI
--     drafts (ai_pending_approval) never auto-send. Core logic unchanged.
--   * `claim_next_ai_thread()` / `reclaim_stale_generating()` mirror the
--     outbound claim/reclaim pattern for the AI cron.
--
--  Everything is additive + idempotent — safe to re-run. Never edit 0001.
-- =====================================================================

-- ---------- app_settings: AI switches ----------
alter table public.app_settings
  add column if not exists ai_enabled   boolean not null default false,  -- master kill switch
  add column if not exists ai_autosend  boolean not null default false,  -- false = hold drafts for approval
  add column if not exists ai_max_turns int     not null default 12,      -- AI replies/thread before forced handover
  add column if not exists ai_persona   text,                            -- stable system persona
  add column if not exists ai_knowledge text;                            -- funding KB / do-not-say rules

-- ---------- messages: AI provenance + approval hold ----------
alter table public.messages
  add column if not exists ai_generated        boolean not null default false,
  add column if not exists ai_pending_approval boolean not null default false;

-- draft rows awaiting the owner's tap (UI + claim filter)
create index if not exists messages_ai_pending_idx on public.messages (owner_id, chat_guid)
  where ai_generated and ai_pending_approval;

-- ---------- conversation_state (per-chat AI state + lifecycle) ----------
create table if not exists public.conversation_state (
  owner_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  chat_guid       text not null,
  contact_id      uuid references public.contacts(id) on delete set null,
  status          text not null default 'active'
                    check (status in ('active','needs_reply','generating','escalated','opted_out','done')),
  lifecycle_stage text not null default 'new'
                    check (lifecycle_stage in ('new','engaged','warming','interested','ready_for_handover','handed_off','closed')),
  ai_autopilot    boolean not null default true,         -- per-thread on/off
  ai_turns        int not null default 0,                -- AI replies sent in this thread
  last_inbound_message_id   uuid,                         -- the triggering inbound
  last_processed_inbound_id uuid,                         -- last inbound we replied to (no double-reply)
  claimed_at      timestamptz,                            -- generating-lock for stale reclaim
  qualification   jsonb not null default '{}',            -- revenue / TIB / amount / interest
  handover_summary text,                                  -- AI's brief for the human
  ready_at        timestamptz,                            -- when it flipped ready_for_handover
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (owner_id, chat_guid)
);
create index if not exists convo_claim_idx on public.conversation_state (updated_at)
  where status = 'needs_reply';
create index if not exists convo_handover_idx on public.conversation_state (owner_id, ready_at desc)
  where lifecycle_stage = 'ready_for_handover';

-- ---------- ai_stages (the configurable reply pipeline) ----------
create table if not exists public.ai_stages (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  position   int  not null,                       -- run order
  name       text not null,
  kind       text not null check (kind in ('classify','research','draft','judge','finalize')),
  model      text not null,                       -- OpenRouter slug
  prompt     text not null,                       -- the stage's own instructions
  enabled    boolean not null default true,
  can_block  boolean not null default true,       -- may reject/revise/escalate
  created_at timestamptz not null default now()
);
create index if not exists ai_stages_order_idx on public.ai_stages (owner_id, position);

-- ---------- ai_runs (per-execution audit trace) ----------
create table if not exists public.ai_runs (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  chat_guid          text not null,
  inbound_message_id uuid,
  outcome            text not null,               -- replied|held|escalated|opted_out|no_reply|max_turns|error
  final_reply        text,
  stages             jsonb not null default '[]', -- [{name,model,verdict,analysis,draft,ms,tokens}]
  created_at         timestamptz not null default now()
);
create index if not exists ai_runs_chat_idx on public.ai_runs (owner_id, chat_guid, created_at desc);

-- ---------- notifications (dashboard alerts) ----------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type       text not null check (type in ('handover','escalation','opt_out')),
  chat_guid  text,
  title      text not null,
  body       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_unread_idx on public.notifications (owner_id, created_at desc)
  where read_at is null;

-- =====================================================================
--  ROW LEVEL SECURITY (owner-scoped, mirrors 0001)
-- =====================================================================
alter table public.conversation_state enable row level security;
alter table public.ai_stages          enable row level security;
alter table public.ai_runs            enable row level security;
alter table public.notifications      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['conversation_state','ai_stages','ai_runs','notifications'] loop
    execute format('drop policy if exists owner_all on public.%I', t);
    execute format($f$
      create policy owner_all on public.%I
        for all
        using (auth.uid() is not null and auth.uid() = owner_id)
        with check (auth.uid() is not null and auth.uid() = owner_id)
    $f$, t);
  end loop;
end $$;

-- =====================================================================
--  REALTIME (live handover badge + thread state)
-- =====================================================================
do $$ begin
  alter publication supabase_realtime add table public.conversation_state;
exception when duplicate_object then null; end $$;
alter table public.conversation_state replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;
alter table public.notifications replica identity full;

-- =====================================================================
--  claim_next_send() — re-created from 0001 with ONE added predicate:
--  `and ai_pending_approval = false`, so held AI drafts never auto-send.
--  Everything else is identical to 0001.
-- =====================================================================
create or replace function public.claim_next_send()
returns setof public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  s              public.app_settings;
  v_row          public.messages;
  v_local_today  date;
  v_gap          int;
  v_hour         int;
  v_now          timestamptz := now();
begin
  select * into s from public.app_settings where id = true for update;
  if not found or s.paused then
    return;
  end if;

  v_local_today := (v_now at time zone s.timezone)::date;
  if v_local_today <> s.sends_today_date then
    update public.app_settings
      set sends_today = 0, sends_today_date = v_local_today, updated_at = v_now
      where id = true;
    s.sends_today := 0;
  end if;

  if s.sends_today >= s.daily_cap then
    return;
  end if;

  if s.send_window_start is not null and s.send_window_end is not null then
    v_hour := extract(hour from (v_now at time zone s.timezone));
    if v_hour < s.send_window_start or v_hour >= s.send_window_end then
      return;
    end if;
  end if;

  if s.next_send_allowed_at > v_now then
    return;
  end if;

  -- claim ONE due queued outbound row, oldest first, skipping locked.
  -- AI drafts pending approval are held back until the owner approves.
  select * into v_row
  from public.messages
  where direction = 'out'
    and status = 'queued'
    and available_at <= v_now
    and ai_pending_approval = false
  order by available_at
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  update public.messages
    set status = 'sending', claimed_at = v_now, attempts = attempts + 1, updated_at = v_now
    where id = v_row.id
    returning * into v_row;

  v_gap := s.min_delay_seconds + floor(random() * (s.jitter_seconds + 1))::int;
  update public.app_settings
    set next_send_allowed_at = v_now + make_interval(secs => v_gap),
        sends_today = sends_today + 1,
        updated_at = v_now
    where id = true;

  return next v_row;
end;
$$;

-- =====================================================================
--  claim_next_ai_thread() — atomically claim ONE thread needing a reply,
--  flip it to 'generating'. Gated by ai_enabled + not paused + per-thread
--  autopilot. FOR UPDATE SKIP LOCKED makes overlapping AI cron ticks safe
--  (exactly one reply per inbound even on BlueBubbles retries/bursts).
-- =====================================================================
create or replace function public.claim_next_ai_thread()
returns setof public.conversation_state
language plpgsql
security definer
set search_path = public
as $$
declare
  s      public.app_settings;
  v_row  public.conversation_state;
  v_now  timestamptz := now();
begin
  select * into s from public.app_settings where id = true;
  if not found or s.paused or not s.ai_enabled then
    return;
  end if;

  select * into v_row
  from public.conversation_state
  where status = 'needs_reply'
    and ai_autopilot = true
  order by updated_at
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  update public.conversation_state
    set status = 'generating', claimed_at = v_now, updated_at = v_now
    where owner_id = v_row.owner_id and chat_guid = v_row.chat_guid
    returning * into v_row;

  return next v_row;
end;
$$;

-- Reclaim threads stuck in 'generating' (cron crashed mid-pipeline) so they
-- get retried on the next tick.
create or replace function public.reclaim_stale_generating(stale_seconds int default 180)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  with updated as (
    update public.conversation_state c
      set status = 'needs_reply', claimed_at = null, updated_at = now()
      where c.status = 'generating'
        and c.claimed_at < now() - make_interval(secs => stale_seconds)
      returning 1)
  select count(*) into n from updated;
  return n;
end;
$$;

-- =====================================================================
--  Seed the default premium pipeline (only if empty). owner_id = the single
--  app user. Stage prompts are task-focused; the orchestrator appends the
--  shared JSON output contract + persona/knowledge/context at run time.
-- =====================================================================
insert into public.ai_stages (owner_id, position, name, kind, model, prompt, can_block)
select u.id, v.position, v.name, v.kind, v.model, v.prompt, v.can_block
from (select id from auth.users order by created_at limit 1) u,
(values
  (1, 'Classifier', 'classify', 'google/gemini-2.5-flash-lite',
   $p$You are the first stage of an SMS reply pipeline for a business-funding (merchant cash advance) outreach rep. Read the conversation and classify the latest inbound message: the merchant's intent, sentiment, whether they are asking to stop/opt out, whether they explicitly want a human or are ready to talk numbers (a handover signal), and whether the message is off-topic or spam. Do NOT write a reply — just report your read for the later stages.$p$, false),
  (2, 'Researcher', 'research', 'google/gemini-2.5-flash',
   $p$You assemble context for the drafter. From the conversation and the knowledge base, pull the few facts relevant to the merchant's latest message, summarize what we already know about them (monthly revenue, time in business, amount sought, interest level), and note the single most useful thing to learn next. Do NOT write the reply. Keep it brief; put captured facts in qualification_updates.$p$, false),
  (3, 'Drafter', 'draft', 'anthropic/claude-sonnet-4.5',
   $p$You ARE the rep texting the merchant. Write the next SMS reply: short (1–2 sentences, like a real person texts), warm, natural, and advancing the conversation by at most ONE question. Re-warm and engage — never pushy. NEVER quote specific rates, terms, fees, or approval amounts, and never guarantee funding. Don't sound like a bot or use corporate filler ("I'd be happy to…", "Thank you for reaching out"). Use the persona, knowledge, and prior context. Put your message in draft.$p$, false),
  (4, 'Compliance Judge', 'judge', 'anthropic/claude-sonnet-4.5',
   $p$You are a strict compliance reviewer with the power to block. REJECT or REVISE the draft if it: quotes or implies specific rates/terms/fees/approval amounts, over-promises or guarantees funding, ignores an opt-out, tries to collect sensitive personal or financial info over text, or is pushy, misleading, or dishonest. If the merchant asked something outside a re-warming rep's scope (legal/financial advice, detailed underwriting), ESCALATE to a human instead of answering. If the draft is clean, APPROVE it unchanged. When you revise, return the corrected text in draft.$p$, true),
  (5, 'Tone & Quality Judge', 'judge', 'anthropic/claude-sonnet-4.5',
   $p$You judge whether the draft reads like a real person texting: natural, concise, on-brand, no AI tells (no "I'd be happy to", no over-explaining, no emoji spam, not stiff or formal). If it is off, REVISE it to sound human while keeping the meaning and returning the new text in draft. If it already sounds human and on-point, APPROVE.$p$, true),
  (6, 'Finalizer', 'finalize', 'google/gemini-2.5-flash-lite',
   $p$Final pass. Trim the reply to a tight SMS: remove any preamble, greeting boilerplate, sign-off, or filler; keep it to 1–2 short sentences. Fix obvious typos. Do NOT change the meaning or add new claims. Return the final text in draft and APPROVE.$p$, false)
) as v(position, name, kind, model, prompt, can_block)
where exists (select 1 from auth.users)
  and not exists (select 1 from public.ai_stages);
