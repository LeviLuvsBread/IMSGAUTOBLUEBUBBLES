-- =====================================================================
--  IMSGAUTOBLUEBUBBLES — initial schema
--  Single-user iMessage outreach dashboard.
--
--  Design:
--   * `messages` is the SINGLE source of truth for every message (inbound
--     AND outbound) AND doubles as the throttled outbound work queue via a
--     status state machine. The inbox/conversation UI and Realtime read it.
--   * `app_settings` holds ONE global throttle "gate" (next_send_allowed_at)
--     plus the daily cap. Spacing is enforced by the gate timestamp, so it
--     holds no matter how often the cron pump runs.
--   * `claim_next_send()` atomically checks gate/cap/window, claims ONE due
--     outbound row (FOR UPDATE SKIP LOCKED), advances the gate, and burns a
--     daily slot — making overlapping cron ticks safe.
--
--  RLS: every user-owned table carries owner_id = auth.uid(); the single user
--  only sees their rows. The service-role client (webhook + cron) bypasses RLS
--  and stamps owner_id = APP_OWNER_ID explicitly.
-- =====================================================================

-- ---------- enums ----------
do $$ begin
  create type message_direction as enum ('out', 'in');
exception when duplicate_object then null; end $$;

do $$ begin
  create type message_status as enum (
    'queued',     -- outbound, waiting for the pump
    'sending',    -- claimed by a pump tick; HTTP fire-and-forget in flight
    'sent',       -- BB accepted / optimistic; awaiting delivery webhook
    'delivered',  -- updated-message webhook with dateDelivered
    'read',       -- updated-message webhook with dateRead
    'failed',     -- terminal failure after max attempts (dead-letter)
    'canceled',   -- user canceled before send
    'received'    -- inbound message (terminal)
  );
exception when duplicate_object then null; end $$;

-- ---------- contacts ----------
create table if not exists public.contacts (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  phone       text not null,               -- E.164, e.g. +14155551234
  email       text,
  company     text,
  tags        text[] not null default '{}',
  notes       text,
  chat_guid   text,                         -- cached "iMessage;-;+1XXXXXXXXXX"
  opted_out   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_id, phone)
);
create index if not exists contacts_tags_idx    on public.contacts using gin (tags);
create index if not exists contacts_company_idx on public.contacts (owner_id, company);

-- ---------- templates ----------
create table if not exists public.templates (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  body        text not null,                -- "Hi {{name}}, ..." (mustache-style)
  variables   jsonb not null default '[]',  -- ["name","company"] extracted from body
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- campaigns (bulk sends) ----------
create table if not exists public.campaigns (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  template_id uuid references public.templates(id) on delete set null,
  body        text,                          -- snapshot of body at enqueue time
  segment     jsonb not null default '{}',   -- {tags:[],company:"",contact_ids:[]}
  total       int not null default 0,
  status      text not null default 'active' check (status in ('active','paused','done','canceled')),
  created_at  timestamptz not null default now()
);
create index if not exists campaigns_owner_idx on public.campaigns (owner_id, created_at desc);

-- ---------- scheduled_sends ----------
create table if not exists public.scheduled_sends (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contact_id  uuid references public.contacts(id) on delete set null,
  segment     jsonb,                         -- for scheduled bulk; null for single
  template_id uuid references public.templates(id) on delete set null,
  body        text,                          -- literal body or render-at-fire
  run_at      timestamptz not null,          -- next fire time (UTC)
  recurrence  text,                          -- null = one-shot; 'daily' | 'weekly'
  status      text not null default 'active' check (status in ('active','paused','done','canceled')),
  last_run_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists scheduled_due_idx on public.scheduled_sends (status, run_at);

-- ---------- sequences (multi-step follow-ups) ----------
create table if not exists public.sequences (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  steps      jsonb not null default '[]',    -- [{offset_hours:0,template_id|body}, ...]
  created_at timestamptz not null default now()
);

create table if not exists public.sequence_enrollments (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sequence_id   uuid not null references public.sequences(id) on delete cascade,
  contact_id    uuid references public.contacts(id) on delete set null,
  chat_guid     text not null,
  recipient     text not null,
  current_step  int not null default 0,
  next_step_at  timestamptz not null default now(),
  status        text not null default 'active' check (status in ('active','completed','stopped')),
  stop_on_reply boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists enroll_due_idx on public.sequence_enrollments (status, next_step_at);
create index if not exists enroll_chat_idx on public.sequence_enrollments (chat_guid);

-- ---------- messages (source of truth + outbound queue) ----------
create table if not exists public.messages (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contact_id         uuid references public.contacts(id) on delete set null,
  chat_guid          text not null,                 -- "iMessage;-;+1..."
  direction          message_direction not null,
  body               text not null,
  status             message_status not null,

  -- provenance
  source             text not null default 'manual',-- manual|bulk|scheduled|sequence|reply
  campaign_id        uuid references public.campaigns(id) on delete set null,
  scheduled_send_id  uuid references public.scheduled_sends(id) on delete set null,

  -- BlueBubbles correlation
  bb_temp_guid       text,                          -- our tempGuid (outbound idempotency key)
  bb_message_guid    text,                          -- BB-assigned guid (response or webhook)
  associated_guid    text,                          -- associatedMessageGuid (reactions/replies)
  error              text,

  -- queue / state-machine bookkeeping (outbound only)
  attempts           int not null default 0,
  max_attempts       int not null default 4,
  available_at       timestamptz not null default now(), -- earliest claimable (throttle/schedule)
  claimed_at         timestamptz,                        -- set on -> sending (stale reclaim)

  -- timestamps mirrored from the BB Message object
  bb_date_created    timestamptz,
  bb_date_delivered  timestamptz,
  bb_date_read       timestamptz,

  created_at         timestamptz not null default now(),
  sent_at            timestamptz,
  updated_at         timestamptz not null default now()
);

-- conversation view (newest first per chat)
create index if not exists messages_convo_idx on public.messages (owner_id, chat_guid, created_at desc);
-- dashboards / status filters
create index if not exists messages_status_idx on public.messages (owner_id, status);
-- claim hot path: due, queued, outbound
create index if not exists messages_claim_idx on public.messages (available_at)
  where direction = 'out' and status = 'queued';
-- reconciliation lookups (match echo/receipts when tempGuid not echoed)
create index if not exists messages_recon_idx on public.messages (chat_guid, status, sent_at);
-- idempotent inbound upsert + outbound link
create unique index if not exists messages_bb_guid_uq on public.messages (bb_message_guid)
  where bb_message_guid is not null;
create index if not exists messages_temp_guid_idx on public.messages (bb_temp_guid)
  where bb_temp_guid is not null;
create index if not exists messages_campaign_idx on public.messages (campaign_id)
  where campaign_id is not null;

-- ---------- app_settings (singleton: global gate + throttle config) ----------
create table if not exists public.app_settings (
  id                   boolean primary key default true check (id),  -- enforces single row
  min_delay_seconds    int not null default 45,
  jitter_seconds       int not null default 75,      -- random 0..jitter added per gap
  daily_cap            int not null default 40,
  batch_size           int not null default 10,      -- max claims attempted per pump tick
  send_window_start    int default 9,                -- local hour [0-23], null = anytime
  send_window_end      int default 18,
  timezone             text not null default 'America/New_York',
  next_send_allowed_at timestamptz not null default now(),  -- THE GATE
  sends_today          int not null default 0,
  sends_today_date     date not null default current_date,
  bb_url               text,                          -- live BB base URL (self-healing)
  paused               boolean not null default false,
  updated_at           timestamptz not null default now()
);
insert into public.app_settings (id) values (true) on conflict (id) do nothing;

-- =====================================================================
--  ROW LEVEL SECURITY
-- =====================================================================
alter table public.contacts             enable row level security;
alter table public.templates            enable row level security;
alter table public.campaigns            enable row level security;
alter table public.scheduled_sends      enable row level security;
alter table public.sequences            enable row level security;
alter table public.sequence_enrollments enable row level security;
alter table public.messages             enable row level security;
alter table public.app_settings         enable row level security;

-- owner-scoped policies (one per table, identical shape)
do $$
declare t text;
begin
  foreach t in array array[
    'contacts','templates','campaigns','scheduled_sends',
    'sequences','sequence_enrollments','messages'
  ] loop
    execute format('drop policy if exists owner_all on public.%I', t);
    execute format($f$
      create policy owner_all on public.%I
        for all
        using (auth.uid() is not null and auth.uid() = owner_id)
        with check (auth.uid() is not null and auth.uid() = owner_id)
    $f$, t);
  end loop;
end $$;

-- app_settings is a global singleton: any authenticated user (i.e. you) may read/write.
drop policy if exists settings_authed on public.app_settings;
create policy settings_authed on public.app_settings
  for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- =====================================================================
--  REALTIME  (broadcasts respect RLS)
-- =====================================================================
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;
alter table public.messages replica identity full;

-- =====================================================================
--  ATOMIC CLAIM RPC
--  Returns at most ONE due outbound message, transitions it to 'sending',
--  advances the global gate, and burns a daily slot. The FOR UPDATE on
--  app_settings serializes concurrent pumps (one send identity = serial).
--  The cron pump calls this in a loop until it returns no rows.
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
  -- global mutex for the gate/counter (serializes overlapping pumps)
  select * into s from public.app_settings where id = true for update;
  if not found or s.paused then
    return;
  end if;

  -- daily cap reset, local-tz aware (Vercel runs UTC)
  v_local_today := (v_now at time zone s.timezone)::date;
  if v_local_today <> s.sends_today_date then
    update public.app_settings
      set sends_today = 0, sends_today_date = v_local_today, updated_at = v_now
      where id = true;
    s.sends_today := 0;
  end if;

  -- daily cap gate
  if s.sends_today >= s.daily_cap then
    return;
  end if;

  -- send-window gate (optional local-hour window)
  if s.send_window_start is not null and s.send_window_end is not null then
    v_hour := extract(hour from (v_now at time zone s.timezone));
    if v_hour < s.send_window_start or v_hour >= s.send_window_end then
      return;
    end if;
  end if;

  -- spacing gate
  if s.next_send_allowed_at > v_now then
    return;
  end if;

  -- claim ONE due queued outbound row, oldest first, skipping locked
  select * into v_row
  from public.messages
  where direction = 'out'
    and status = 'queued'
    and available_at <= v_now
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

  -- advance the gate (min_delay + jitter) and burn a daily slot
  v_gap := s.min_delay_seconds + floor(random() * (s.jitter_seconds + 1))::int;
  update public.app_settings
    set next_send_allowed_at = v_now + make_interval(secs => v_gap),
        sends_today = sends_today + 1,
        updated_at = v_now
    where id = true;

  return next v_row;
end;
$$;

-- Reclaim outbound rows stuck in 'sending' (process crashed mid-send) so they
-- can retry or dead-letter. Call from the pump/safety cron. The window must be
-- longer than BB's worst AppleScript stall + our abort timeout.
create or replace function public.reclaim_stale_sending(stale_seconds int default 120)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  with updated as (
    update public.messages m
      set status = case when m.attempts >= m.max_attempts then 'failed'::message_status
                        else 'queued'::message_status end,
          available_at = case when m.attempts >= m.max_attempts then m.available_at
                              else v_backoff(m.attempts) end,
          error = coalesce(m.error,'') || ' [reclaimed stale sending]',
          claimed_at = null,
          updated_at = now()
      where m.direction = 'out'
        and m.status = 'sending'
        and m.claimed_at < now() - make_interval(secs => stale_seconds)
      returning 1)
  select count(*) into n from updated;
  return n;
end;
$$;

-- exponential backoff (capped 1h) for retries
create or replace function public.v_backoff(attempts int)
returns timestamptz
language sql
immutable
as $$
  select now() + make_interval(secs => least(3600, (power(2, greatest(attempts,1) - 1) * 60))::int
                                        + floor(random() * 30)::int);
$$;
