import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProviderMessage } from "@/lib/provider/types";
import type { Message, MessageStatus } from "@/lib/types";
import { addressFromChatGuid, toE164 } from "@/lib/chat";

const RANK: Record<MessageStatus, number> = {
  queued: 0,
  sending: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: 5,
  canceled: 5,
  received: 5,
};

// Window (ms) for the heuristic time-based match when tempGuid isn't echoed.
const MATCH_WINDOW_MS = 3 * 60 * 1000;

// Find the outbound message row that a BlueBubbles echo/receipt belongs to.
async function matchOutbound(
  admin: SupabaseClient,
  msg: ProviderMessage,
): Promise<Message | null> {
  // Tier 1: already linked by guid.
  if (msg.guid) {
    const { data } = await admin
      .from("messages")
      .select("*")
      .eq("bb_message_guid", msg.guid)
      .limit(1)
      .maybeSingle();
    if (data) return data as Message;
  }

  // Tier 2: BB echoed our tempGuid (future-proofing).
  if (msg.tempGuid) {
    const { data } = await admin
      .from("messages")
      .select("*")
      .eq("bb_temp_guid", msg.tempGuid)
      .limit(1)
      .maybeSingle();
    if (data) return data as Message;
  }

  // Tier 3: heuristic — same chat + body + outbound + unlinked, nearest in time.
  if (!msg.chatGuid) return null;
  const anchor = msg.dateCreated ? new Date(msg.dateCreated).getTime() : Date.now();
  const lo = new Date(anchor - MATCH_WINDOW_MS).toISOString();
  const hi = new Date(anchor + MATCH_WINDOW_MS).toISOString();

  const { data } = await admin
    .from("messages")
    .select("*")
    .eq("chat_guid", msg.chatGuid)
    .eq("direction", "out")
    .eq("body", msg.text)
    .is("bb_message_guid", null)
    .in("status", ["sending", "sent", "delivered"])
    .gte("sent_at", lo)
    .lte("sent_at", hi);

  const rows = (data ?? []) as Message[];
  if (rows.length === 0) return null;
  rows.sort((a, b) => {
    const da = Math.abs(new Date(a.sent_at ?? a.created_at).getTime() - anchor);
    const db = Math.abs(new Date(b.sent_at ?? b.created_at).getTime() - anchor);
    return da - db;
  });
  return rows[0];
}

// Apply an outbound echo or delivery/read receipt to the matching row.
// Returns true if a row was updated.
export async function reconcileOutbound(
  admin: SupabaseClient,
  msg: ProviderMessage,
): Promise<boolean> {
  const row = await matchOutbound(admin, msg);
  if (!row) return false;

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (!row.bb_message_guid && msg.guid) update.bb_message_guid = msg.guid;
  if (msg.dateCreated && !row.bb_date_created) update.bb_date_created = msg.dateCreated;
  if (msg.dateDelivered) update.bb_date_delivered = msg.dateDelivered;
  if (msg.dateRead) update.bb_date_read = msg.dateRead;
  if (msg.associatedMessageGuid) update.associated_guid = msg.associatedMessageGuid;

  // Compute the target status (never downgrade).
  let target: MessageStatus = row.status;
  if (msg.errorCode && msg.errorCode > 0) {
    target = "failed";
    update.error = `BlueBubbles error code ${msg.errorCode}`;
  } else if (msg.dateRead) {
    target = "read";
  } else if (msg.dateDelivered) {
    target = "delivered";
  } else {
    target = "sent"; // bare new-message echo
  }
  if (target !== "failed" && RANK[target] > RANK[row.status]) {
    update.status = target;
  } else if (target === "failed") {
    update.status = "failed";
  }
  if (!row.sent_at) update.sent_at = msg.dateCreated ?? new Date().toISOString();

  const { error } = await admin.from("messages").update(update).eq("id", row.id);
  if (error) throw error;
  return true;
}

// Record an inbound (received) message idempotently, attach a contact, and
// stop any active reply-sensitive sequences for that chat.
export async function recordInbound(
  admin: SupabaseClient,
  msg: ProviderMessage,
  ownerId: string,
): Promise<{ inserted: boolean }> {
  // Idempotency: skip if we already stored this guid.
  if (msg.guid) {
    const { data: existing } = await admin
      .from("messages")
      .select("id")
      .eq("bb_message_guid", msg.guid)
      .limit(1)
      .maybeSingle();
    if (existing) return { inserted: false };
  }

  // Attach a contact by phone (handle address or chat guid suffix).
  let contactId: string | null = null;
  const address = msg.handleAddress ?? addressFromChatGuid(msg.chatGuid);
  if (address) {
    const e164 = address.includes("@") ? address : toE164(address);
    const { data: contact } = await admin
      .from("contacts")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("phone", e164)
      .limit(1)
      .maybeSingle();
    contactId = contact?.id ?? null;
  }

  const { error } = await admin.from("messages").insert({
    owner_id: ownerId,
    contact_id: contactId,
    chat_guid: msg.chatGuid,
    direction: "in",
    body: msg.text,
    status: "received",
    source: "reply",
    bb_message_guid: msg.guid ?? null,
    bb_date_created: msg.dateCreated ?? new Date().toISOString(),
    associated_guid: msg.associatedMessageGuid ?? null,
  });
  if (error) {
    // Unique violation on bb_message_guid → a concurrent insert won; treat as ok.
    if ((error as { code?: string }).code === "23505") return { inserted: false };
    throw error;
  }

  // stop_on_reply: halt active sequences for this chat.
  await admin
    .from("sequence_enrollments")
    .update({ status: "stopped" })
    .eq("owner_id", ownerId)
    .eq("chat_guid", msg.chatGuid)
    .eq("status", "active")
    .eq("stop_on_reply", true);

  return { inserted: true };
}
