-- =====================================================================
--  Test-number send-window exemption (additive to 0001/0002)
--
--  Re-creates claim_next_send() so the send window is no longer a global
--  early-return: outside business hours, ONLY the test number
--  (+13058134292 / LEVI-TEST) is eligible to send, so testing is never
--  blocked by the clock. Every other number still respects the window,
--  daily cap, spacing, pause, and the AI-draft approval hold — unchanged.
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
  v_in_window    boolean := true;
  v_now          timestamptz := now();
begin
  select * into s from public.app_settings where id = true for update;
  if not found or s.paused then
    return;
  end if;

  -- daily cap reset, local-tz aware
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

  -- compute whether we're inside the optional send window. NOTE: this is no
  -- longer an early return — the test number is exempt and may send any hour.
  if s.send_window_start is not null and s.send_window_end is not null then
    v_hour := extract(hour from (v_now at time zone s.timezone));
    v_in_window := (v_hour >= s.send_window_start and v_hour < s.send_window_end);
  end if;

  -- spacing gate (global)
  if s.next_send_allowed_at > v_now then
    return;
  end if;

  -- claim ONE due queued outbound row. Held AI drafts wait for approval.
  -- Outside the send window, only the test number (+13058134292) is eligible.
  select * into v_row
  from public.messages
  where direction = 'out'
    and status = 'queued'
    and available_at <= v_now
    and ai_pending_approval = false
    and (v_in_window or chat_guid = 'iMessage;-;+13058134292')
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
