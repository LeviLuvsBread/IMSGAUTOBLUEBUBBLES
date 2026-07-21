import type { SupabaseClient } from "@supabase/supabase-js";

// User-initiated outreach sources only — excludes inbound ("reply") and
// legacy AI-reply rows ("ai", from the removed responder), so "last
// recipients" is the last group YOU actually composed/sent to.
const OUTREACH_SOURCES = ["bulk", "auto_outreach", "manual", "assistant"];

// Statuses that mean "I sent this" (or it's on its way out) — a canceled or
// failed row was never really sent.
const SENT_STATUSES = ["queued", "sending", "sent", "delivered", "read"];

// Rows within this gap belong to the same send session. A bulk send enqueues
// every row in one statement, so they share a created_at to the millisecond;
// even a small gap cleanly separates one session from the next.
const BATCH_GAP_MS = 30 * 60 * 1000; // 30 minutes

// Contact IDs from your most recent send session (a "batch"), newest first.
// Walks outbound outreach rows from newest backward (by created_at, which
// clusters a bulk send tightly regardless of how slowly it drips out under the
// throttle), collecting distinct contacts until it hits a gap > BATCH_GAP_MS.
export async function lastSentBatch(
  supabase: SupabaseClient,
  limit = 1000,
): Promise<string[]> {
  const { data } = await supabase
    .from("messages")
    .select("contact_id, created_at")
    .eq("direction", "out")
    .in("status", SENT_STATUSES)
    .in("source", OUTREACH_SOURCES)
    .not("contact_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = (data ?? []) as { contact_id: string | null; created_at: string }[];

  const ids: string[] = [];
  const seen = new Set<string>();
  let prev: number | null = null;
  for (const r of rows) {
    if (!r.contact_id) continue;
    const t = new Date(r.created_at).getTime();
    if (prev !== null && prev - t > BATCH_GAP_MS) break; // gap → older session
    prev = t;
    if (!seen.has(r.contact_id)) {
      seen.add(r.contact_id);
      ids.push(r.contact_id);
    }
  }
  return ids;
}
