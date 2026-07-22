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
// pulled). Exhaustive + paged (no recency cap): this drives Compose's "Skip
// already texted" duplicate protection, where completeness is the whole point.
export async function contactedIds(
  supabase: SupabaseClient,
): Promise<string[]> {
  const ids = new Set<string>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("messages")
      .select("contact_id")
      .eq("direction", "out")
      .in("status", ["queued", "sending", "sent", "delivered", "read"])
      .not("contact_id", "is", null)
      .order("contact_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of (data ?? []) as { contact_id: string }[]) ids.add(r.contact_id);
    if (!data || data.length < PAGE) break;
  }
  return [...ids];
}
