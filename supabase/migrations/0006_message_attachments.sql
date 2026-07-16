-- =====================================================================
--  0006_message_attachments
--
--  Store attachment metadata (photos, videos, PDFs, …) on messages, as
--  captured from the BlueBubbles new-message webhook:
--    [{ "guid", "mime", "name", "size", "width", "height" }, ...]
--  Bytes are NOT stored — they're streamed on demand from the BlueBubbles
--  server via /api/attachment/[guid].
--
--  Safe to re-run.
-- =====================================================================
alter table public.messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;
