import type { SupabaseClient } from "@supabase/supabase-js";
import { contactedIds } from "@/lib/last-contacted";

export interface EnqueueAttachment {
  storage_path: string; // path in the private uploads bucket
  name: string | null;
  mime: string | null;
  size: number | null;
}

export interface EnqueueInput {
  ownerId: string;
  chatGuid: string;
  body: string;
  contactId?: string | null;
  source?: string; // manual | bulk | scheduled | sequence | reply | ai
  campaignId?: string | null;
  scheduledSendId?: string | null;
  availableAt?: string; // ISO; defaults to now
  attachments?: EnqueueAttachment[]; // files to send (pump streams from storage)
}

function toRow(input: EnqueueInput) {
  const row: Record<string, unknown> = {
    owner_id: input.ownerId,
    contact_id: input.contactId ?? null,
    chat_guid: input.chatGuid,
    direction: "out" as const,
    body: input.body,
    status: "queued" as const,
    source: input.source ?? "manual",
    campaign_id: input.campaignId ?? null,
    scheduled_send_id: input.scheduledSendId ?? null,
    bb_temp_guid: crypto.randomUUID(),
    available_at: input.availableAt ?? new Date().toISOString(),
  };
  if (input.attachments?.length) row.attachments = input.attachments;
  return row;
}

// Enqueue a single outbound message (status 'queued'). The cron pump drips it
// out under the global throttle gate.
export async function enqueueMessage(
  supabase: SupabaseClient,
  input: EnqueueInput,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("messages")
    .insert(toRow(input))
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string };
}

// Bulk enqueue (campaigns / scheduled bulk). Returns the number inserted.
export async function enqueueBulk(
  supabase: SupabaseClient,
  inputs: EnqueueInput[],
): Promise<number> {
  if (inputs.length === 0) return 0;
  const rows = inputs.map(toRow);
  const { error, count } = await supabase
    .from("messages")
    .insert(rows, { count: "exact" });
  if (error) throw error;
  return count ?? rows.length;
}

// Enqueue OPENER rows with the atomic no-double-opener backstop. Callers pass
// contacts already pre-filtered by partitionByOpened, but that check-then-insert
// has a race window; the messages_one_opener_per_contact partial UNIQUE index
// (migration 0007) closes it by rejecting a second live opener row for a
// contact. On the rare race the whole batch INSERT rolls back with a unique
// violation (23505) — we re-read the now-committed opener set, drop whoever the
// racer just claimed, and retry the survivors. contactedIds() is a superset of
// the index's covered contacts, so each pass strictly shrinks the conflict set;
// it converges in one or two passes (bounded to 3). If anyone still conflicts
// after 3 passes we drop them unsent — the fail-safe direction is always "skip,
// never double-text". Every path that sends a cold opener MUST enqueue through
// here, not enqueueBulk, or a raced duplicate would abort its whole batch
// instead of degrading gracefully.
export async function enqueueOpeners(
  supabase: SupabaseClient,
  inputs: EnqueueInput[],
): Promise<number> {
  let remaining = inputs;
  let queued = 0;
  for (let attempt = 0; attempt < 3 && remaining.length > 0; attempt++) {
    try {
      queued += await enqueueBulk(supabase, remaining);
      remaining = [];
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code !== "23505") throw err; // not a duplicate-opener collision
      const opened = new Set(await contactedIds(supabase));
      remaining = remaining.filter((i) => !i.contactId || !opened.has(i.contactId));
    }
  }
  return queued;
}
