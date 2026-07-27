import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProviderMessage, MessageProvider } from "@/lib/provider/types";
import type { Message, MessageStatus } from "@/lib/types";
import { addressFromChatGuid, toE164 } from "@/lib/chat";
import { isOptOut } from "@/lib/ai/guardrails";
import { applyOptOut } from "@/lib/queue/opt-out";

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

// Apply an outbound echo or delivery/read receipt to the matching row. If no
// app-enqueued row matches, the owner sent this from OUTSIDE the app (their
// iPhone/Mac Messages, or another device) — capture it so the thread shows BOTH
// sides of the conversation, not just the lead's replies. Returns true if a row
// was updated or inserted.
export async function reconcileOutbound(
  admin: SupabaseClient,
  msg: ProviderMessage,
  ownerId: string,
): Promise<boolean> {
  const row = await matchOutbound(admin, msg);
  if (!row) return recordExternalOutbound(admin, msg, ownerId);

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

// Store an outbound message the owner sent OUTSIDE the app (typed on their
// iPhone/Mac, another device) so it shows in the thread — otherwise the owner's
// whole side of a conversation is invisible and the dashboard only ever shows
// the app-sent opener plus the lead's replies. Idempotent by bb_message_guid
// (also backed by the unique index). Skips content-less receipts/typing so we
// don't render empty bubbles, and skips anything that looks like an app-sent
// message that merely failed to link by guid, so we never duplicate a bubble.
async function recordExternalOutbound(
  admin: SupabaseClient,
  msg: ProviderMessage,
  ownerId: string,
): Promise<boolean> {
  if (!msg.chatGuid) return false;
  const atts = msg.attachments ?? [];
  const hasBody = (msg.text ?? "").trim().length > 0;
  if (!hasBody && atts.length === 0) return false; // receipt/typing — nothing to show

  // Idempotency: never store the same BlueBubbles guid twice.
  if (msg.guid) {
    const { data: existing } = await admin
      .from("messages")
      .select("id")
      .eq("bb_message_guid", msg.guid)
      .limit(1)
      .maybeSingle();
    if (existing) return false;
  }

  // Dedup guard: if a same-body outbound already exists in this chat near this
  // time, it's our OWN app-sent message that just didn't link by guid (e.g. the
  // send response returned a different guid than the webhook) — don't duplicate
  // it. Broader than matchOutbound's Tier 3 (which skips already-linked rows).
  if (hasBody) {
    const anchor = msg.dateCreated ? new Date(msg.dateCreated).getTime() : Date.now();
    const lo = new Date(anchor - MATCH_WINDOW_MS).toISOString();
    const hi = new Date(anchor + MATCH_WINDOW_MS).toISOString();
    const { data: dup } = await admin
      .from("messages")
      .select("id")
      .eq("chat_guid", msg.chatGuid)
      .eq("direction", "out")
      .eq("body", msg.text)
      .gte("sent_at", lo)
      .lte("sent_at", hi)
      .limit(1);
    if (dup && dup.length) return false;
  }

  // Attach a contact by phone/handle (same resolution as recordInbound).
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

  const errored = !!(msg.errorCode && msg.errorCode > 0);
  const status: MessageStatus = errored
    ? "failed"
    : msg.dateRead
      ? "read"
      : msg.dateDelivered
        ? "delivered"
        : "sent";

  const baseRow: Record<string, unknown> = {
    owner_id: ownerId,
    contact_id: contactId,
    chat_guid: msg.chatGuid,
    direction: "out",
    body: msg.text ?? "",
    status,
    source: "manual", // the owner sent it by hand, from their own device
    bb_message_guid: msg.guid ?? null,
    bb_date_created: msg.dateCreated ?? new Date().toISOString(),
    bb_date_delivered: msg.dateDelivered ?? null,
    bb_date_read: msg.dateRead ?? null,
    associated_guid: msg.associatedMessageGuid ?? null,
    sent_at: msg.dateCreated ?? new Date().toISOString(),
    error: errored ? `BlueBubbles error code ${msg.errorCode}` : null,
  };

  let { error } = await admin
    .from("messages")
    .insert(atts.length ? { ...baseRow, attachments: atts } : baseRow);
  // Attachments column not migrated yet → store without it rather than drop.
  if (
    error &&
    atts.length &&
    ["PGRST204", "42703"].includes((error as { code?: string }).code ?? "")
  ) {
    ({ error } = await admin.from("messages").insert(baseRow));
  }
  if (error) {
    // Unique violation on bb_message_guid → a concurrent webhook already won.
    if ((error as { code?: string }).code === "23505") return false;
    throw error;
  }
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

  const baseRow: Record<string, unknown> = {
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
  };
  const atts = msg.attachments ?? [];

  let { data: insertedRow, error } = await admin
    .from("messages")
    .insert(atts.length ? { ...baseRow, attachments: atts } : baseRow)
    .select("id")
    .single();
  // If the attachments column hasn't been migrated yet, store without it
  // rather than dropping the message (PGRST204 = unknown column via PostgREST,
  // 42703 = undefined column straight from Postgres).
  if (
    error &&
    atts.length &&
    ["PGRST204", "42703"].includes((error as { code?: string }).code ?? "")
  ) {
    ({ data: insertedRow, error } = await admin
      .from("messages")
      .insert(baseRow)
      .select("id")
      .single());
  }
  if (error) {
    // Unique violation on bb_message_guid → a concurrent insert won; treat as ok.
    if ((error as { code?: string }).code === "23505") return { inserted: false };
    throw error;
  }

  // Immediate opt-out: "STOP" (and anything like it) stops EVERYTHING for this
  // thread. Runs before the needs-reply flagging so an opted-out thread never
  // surfaces as awaiting a response. Honored even for unknown numbers.
  if (isOptOut(msg.text ?? "")) {
    await applyOptOut(admin, ownerId, msg.chatGuid, contactId);
    return { inserted: true };
  }

  // stop_on_reply: halt active sequences for this chat.
  await admin
    .from("sequence_enrollments")
    .update({ status: "stopped" })
    .eq("owner_id", ownerId)
    .eq("chat_guid", msg.chatGuid)
    .eq("status", "active")
    .eq("stop_on_reply", true);

  // Flag the thread for the OWNER — replies are handled personally, never by
  // AI. Feeds the dashboard/inbox needs-attention surfaces.
  await flagNeedsReply(admin, ownerId, msg.chatGuid, contactId, insertedRow?.id ?? null);

  return { inserted: true };
}

// Mark a thread as needing the owner's reply. Skips threads already resolved
// (escalated / handed off / closed) or that opted out — those don't re-engage;
// we only refresh the last inbound pointer there. Preserves turns/qualification.
async function flagNeedsReply(
  admin: SupabaseClient,
  ownerId: string,
  chatGuid: string,
  contactId: string | null,
  inboundId: string | null,
): Promise<void> {
  const { data: existing } = await admin
    .from("conversation_state")
    .select("status, lifecycle_stage")
    .eq("owner_id", ownerId)
    .eq("chat_guid", chatGuid)
    .maybeSingle();

  if (!existing) {
    await admin.from("conversation_state").insert({
      owner_id: ownerId,
      chat_guid: chatGuid,
      contact_id: contactId,
      status: "needs_reply",
      last_inbound_message_id: inboundId,
    });
    return;
  }

  const humanOwned =
    existing.status === "opted_out" ||
    existing.status === "escalated" ||
    existing.lifecycle_stage === "handed_off" ||
    existing.lifecycle_stage === "closed";

  const patch: Record<string, unknown> = {
    last_inbound_message_id: inboundId,
    updated_at: new Date().toISOString(),
  };
  if (!humanOwned) patch.status = "needs_reply";
  if (contactId) patch.contact_id = contactId;

  await admin
    .from("conversation_state")
    .update(patch)
    .eq("owner_id", ownerId)
    .eq("chat_guid", chatGuid);
}

async function existsByGuid(admin: SupabaseClient, guid: string): Promise<boolean> {
  const { data } = await admin
    .from("messages")
    .select("id")
    .eq("bb_message_guid", guid)
    .limit(1)
    .maybeSingle();
  return !!data;
}

// One-time (re-runnable) history sync for a chat: pull recent messages from the
// provider and replay each through the SAME idempotent path the live webhook
// uses, so any message we never stored — above all the owner's replies typed on
// their own device, which the app never enqueued — gets surfaced into the
// thread. Safe to run repeatedly: recordInbound and reconcileOutbound both
// dedup by bb_message_guid, so re-syncing only fills gaps.
export async function backfillChat(
  admin: SupabaseClient,
  provider: MessageProvider,
  ownerId: string,
  chatGuid: string,
  limit = 200,
): Promise<{ scanned: number; added: number }> {
  const msgs = await provider.getChatMessages(chatGuid, { limit });
  // Provider returns newest-first; replay oldest-first so surfaced rows land in
  // chronological order.
  const ordered = [...msgs].reverse();
  let added = 0;
  for (const raw of ordered) {
    const msg: ProviderMessage = { ...raw, chatGuid: raw.chatGuid || chatGuid };
    if (!msg.guid) continue; // no guid → can't dedup safely, skip
    try {
      if (msg.isFromMe) {
        const existed = await existsByGuid(admin, msg.guid);
        const changed = await reconcileOutbound(admin, msg, ownerId);
        if (changed && !existed) added++;
      } else {
        const { inserted } = await recordInbound(admin, msg, ownerId);
        if (inserted) added++;
      }
    } catch (e) {
      console.error("[backfill] message failed", msg.guid, e);
    }
  }
  return { scanned: msgs.length, added };
}
