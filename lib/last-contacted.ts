import type { SupabaseClient } from "@supabase/supabase-js";

// Map of contactId -> ISO timestamp of the most recent OUTBOUND message actually
// sent to that contact. Derived from the messages table (no extra column to
// keep in sync). Powers the "last contacted" safety indicators so we don't
// accidentally re-text someone we just reached.
//
// Bounded to the most recent N sends: recency is all the indicator needs, and a
// contact whose last send is older than that was clearly contacted long ago.
export async function lastContactedMap(
  supabase: SupabaseClient,
  limit = 5000,
): Promise<Record<string, string>> {
  const { data } = await supabase
    .from("messages")
    .select("contact_id, sent_at, created_at")
    .eq("direction", "out")
    .in("status", ["sent", "delivered", "read"])
    .not("contact_id", "is", null)
    .order("sent_at", { ascending: false })
    .limit(limit);

  const map: Record<string, string> = {};
  for (const r of (data ?? []) as {
    contact_id: string | null;
    sent_at: string | null;
    created_at: string;
  }[]) {
    if (!r.contact_id) continue;
    // rows arrive newest-first, so the first time we see a contact is its latest
    if (!map[r.contact_id]) map[r.contact_id] = r.sent_at ?? r.created_at;
  }
  return map;
}

// EVERY contact with an outbound message already on its way or delivered —
// queued/sending count too, so re-composing to a list while yesterday's batch
// is still draining doesn't double-text. Failed and canceled are excluded (a
// failed send never reached them; a canceled one the owner deliberately
// pulled). Exhaustive (no recency cap): this drives Compose's "Skip already
// texted" duplicate protection, where completeness is the whole point.
//
// KEYSET-paged on the immutable contact_id (not OFFSET): the status filter is
// on a mutable column, so an OFFSET page would drift and skip a contact if a
// row flipped status mid-scan — a keyset cursor can't.
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
export async function contactedIds(
  supabase: SupabaseClient,
): Promise<string[]> {
  const ids = new Set<string>();
  const PAGE = 1000;
  let cursor = ZERO_UUID;
  for (;;) {
    const { data, error } = await supabase
      .from("messages")
      .select("contact_id")
      .eq("direction", "out")
      .in("status", ["queued", "sending", "sent", "delivered", "read"])
      .gt("contact_id", cursor)
      .order("contact_id", { ascending: true })
      .limit(PAGE);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data as { contact_id: string }[]) ids.add(r.contact_id);
    cursor = (data[data.length - 1] as { contact_id: string }).contact_id;
    if (data.length < PAGE) break;
  }
  return [...ids];
}

// THE OPENER RULE (owner mandate, non-negotiable): every contact receives the
// initial/opener message AT MOST ONCE, EVER. Given a candidate list, split it
// into contacts still eligible for an opener and those already reached. This is
// the single choke point every opener-blast path funnels through — Compose
// (last batch / newest upload / any selection), campaigns, the Director's bulk
// send, and recurring scheduled walks — so no re-upload, re-selection, or
// overlapping schedule can ever text someone their opener a second time.
//
// "Reached" reuses contactedIds() exactly: any outbound message that's
// queued/sending/sent/delivered/read. Canceled and failed rows never arrived,
// so those contacts stay eligible (a wiped queue or a spam-flagged batch can be
// retried). Server-side and mandatory — not the client-side "Skip already
// texted" chip, which is only a pre-send convenience the owner could forget.
//
// This is the FAST PRE-FILTER (it also drives the UI's already-texted counts).
// The ATOMIC guarantee lives in the DB: the partial unique index
// messages_one_opener_per_contact (migration 0007) makes a second live opener
// row for a contact impossible to persist even under a same-instant race that
// slips past this read-then-insert check. Opener enqueues go through
// enqueueOpeners(), which turns the resulting unique violation into a graceful
// skip. Keep this predicate and the index predicate in lockstep.
export async function partitionByOpened<T extends { id: string }>(
  supabase: SupabaseClient,
  candidates: T[],
): Promise<{ eligible: T[]; alreadyOpened: T[] }> {
  if (candidates.length === 0) return { eligible: [], alreadyOpened: [] };
  const opened = new Set(await contactedIds(supabase));
  const eligible: T[] = [];
  const alreadyOpened: T[] = [];
  for (const c of candidates) {
    (opened.has(c.id) ? alreadyOpened : eligible).push(c);
  }
  return { eligible, alreadyOpened };
}
