import type { SupabaseClient } from "@supabase/supabase-js";
import type { Contact, Segment } from "./types";

// Resolve a segment definition to the set of (non-opted-out) contacts it
// targets. Filters combine with AND. An empty segment with all=true returns
// every contact.
export async function resolveSegment(
  supabase: SupabaseClient,
  ownerId: string,
  segment: Segment,
): Promise<Contact[]> {
  let q = supabase
    .from("contacts")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("opted_out", false);

  if (segment.contact_ids && segment.contact_ids.length > 0) {
    q = q.in("id", segment.contact_ids);
  }
  if (segment.company) {
    q = q.eq("company", segment.company);
  }
  if (segment.tags && segment.tags.length > 0) {
    q = q.contains("tags", segment.tags);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Contact[];
}
