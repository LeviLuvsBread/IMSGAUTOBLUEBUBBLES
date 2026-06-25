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
