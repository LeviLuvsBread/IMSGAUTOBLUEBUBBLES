-- =====================================================================
--  0007_no_double_opener
--
--  THE OPENER RULE (owner mandate): a contact receives the initial/opener
--  message AT MOST ONCE, EVER. The app layer (partitionByOpened) already
--  filters already-texted contacts out of every opener blast, but that is a
--  read-then-insert with no lock — two send paths firing in the same instant
--  (e.g. the per-minute cron materializing a schedule while the owner hits Send
--  in Compose) could each read "not texted yet" and both queue an opener =
--  double-text = the Apple error-22 spam flag. This migration adds the ATOMIC
--  backstop the app filter can't provide: a partial UNIQUE index that makes a
--  second live opener row for the same contact physically impossible to persist.
--
--  "Live opener" = an outbound row still queued/sending/sent/delivered/read
--  whose source is a cold-opener blast. Canceled and failed rows fall OUT of the
--  predicate, so a wiped queue or a spam-flagged batch that never landed stays
--  eligible for a genuine retry (matches the app rule exactly).
--
--  EXEMPT from the rule (these legitimately send more than once to a contact and
--  must NOT be constrained): inbox replies / one-off sends ('manual'), sequence
--  follow-up steps ('sequence'), single-contact recurring reminders, and the
--  Director's file broadcasts. The last two were historically logged under the
--  SAME source strings as openers ('scheduled' and 'assistant'), so steps 1-3
--  below re-tag them to their own sources BEFORE the index is built (step 3
--  handles reminders whose schedule was already deleted) — otherwise a repeating
--  reminder or a re-sent file would trip the unique index or lose real history.
--
--  Safe to re-run.
-- =====================================================================

-- 1. Re-tag existing single-contact recurring reminders: they were logged as
--    'scheduled' (same as segment-walk openers) but are exempt. A schedule with
--    contact_id set is a single-contact reminder; one with a segment is an
--    opener walk. (createScheduledSend makes these mutually exclusive.)
update public.messages m
  set source = 'reminder', updated_at = now()
  where m.source = 'scheduled'
    and m.scheduled_send_id is not null
    and exists (
      select 1 from public.scheduled_sends ss
      where ss.id = m.scheduled_send_id and ss.contact_id is not null
    );

-- 2. Re-tag existing Director file broadcasts: logged as 'assistant' (same as
--    the Director's text opener) but exempt. A send_file row is the only
--    'assistant' row that carries attachments.
update public.messages
  set source = 'file', updated_at = now()
  where source = 'assistant'
    and attachments <> '[]'::jsonb;

-- 3. Orphaned reminders: a single-contact reminder whose schedule was later
--    deleted keeps source='scheduled' but scheduled_send_id=NULL (the FK is
--    ON DELETE SET NULL), so step 1's join can't reach it. A segment opener is
--    at most ONE live row per contact, so >1 orphaned live 'scheduled' row for
--    the SAME contact is unambiguously a repeated reminder — re-tag it 'reminder'
--    (exempt) so step 4 doesn't cancel real delivered/read history. A lone orphan
--    stays 'scheduled': one row never trips the unique index, and treating an
--    already-contacted person as opened is correct (they won't be re-opened).
update public.messages m
  set source = 'reminder', updated_at = now()
  from (
    select owner_id, contact_id
    from public.messages
    where direction = 'out'
      and contact_id is not null
      and scheduled_send_id is null
      and source = 'scheduled'
      and status in ('queued','sending','sent','delivered','read')
    group by owner_id, contact_id
    having count(*) > 1
  ) dup
  where m.owner_id = dup.owner_id
    and m.contact_id = dup.contact_id
    and m.scheduled_send_id is null
    and m.source = 'scheduled'
    and m.direction = 'out'
    and m.status in ('queued','sending','sent','delivered','read');

-- 4. Collapse any PRE-EXISTING duplicate live openers so the unique index can be
--    built (and so anyone the old code already queued twice can't double-send).
--    Keep the most-progressed row per (owner_id, contact_id); cancel the rest.
with ranked as (
  select id,
         row_number() over (
           partition by owner_id, contact_id
           order by (case status
                       when 'read'      then 5
                       when 'delivered' then 4
                       when 'sent'      then 3
                       when 'sending'   then 2
                       when 'queued'    then 1
                       else 0 end) desc,
                    created_at asc, id asc
         ) as rn
  from public.messages
  where direction = 'out'
    and contact_id is not null
    and status in ('queued','sending','sent','delivered','read')
    and source in ('bulk','auto_outreach','scheduled','assistant')
)
update public.messages m
  set status = 'canceled',
      error = coalesce(m.error,'') || ' [deduped: pre-existing duplicate opener]',
      updated_at = now()
  from ranked
  where m.id = ranked.id and ranked.rn > 1;

-- 5. The backstop: at most ONE live opener per (owner_id, contact_id). The
--    predicate MUST stay in lockstep with lib/last-contacted.ts (contactedIds /
--    partitionByOpened) and the opener sources rerouted through enqueueOpeners.
create unique index if not exists messages_one_opener_per_contact
  on public.messages (owner_id, contact_id)
  where direction = 'out'
    and contact_id is not null
    and status in ('queued','sending','sent','delivered','read')
    and source in ('bulk','auto_outreach','scheduled','assistant');
