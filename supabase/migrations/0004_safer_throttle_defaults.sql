-- =====================================================================
--  0004_safer_throttle_defaults
--
--  Raise the live send spacing to ~2-3 min between messages. Sending fast
--  and evenly is a spam signal; after an account flag we widen the gap.
--
--  Only ever RAISES the existing values (greatest), so a number already set
--  more conservatively is left untouched. Safe to re-run.
-- =====================================================================
update public.app_settings
  set min_delay_seconds = greatest(min_delay_seconds, 120),
      jitter_seconds    = greatest(jitter_seconds, 60),
      updated_at        = now()
  where id = true;
