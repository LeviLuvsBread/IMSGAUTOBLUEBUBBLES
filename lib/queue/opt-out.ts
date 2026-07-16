import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Hard opt-out: mark the contact, cancel anything queued to them, stop every
// sequence, and park the conversation as opted_out so the AI never replies.
// Shared by the webhook ingest, the AI responder, and the manual "Opt out"
// button — one routine, one behavior.
export async function applyOptOut(
  db: SupabaseClient,
  ownerId: string,
  chatGuid: string,
  contactId: string | null,
): Promise<void> {
  const now = new Date().toISOString();

  // Never message this number again.
  if (contactId) {
    await db
      .from("contacts")
      .update({ opted_out: true, updated_at: now })
      .eq("id", contactId);
  }

  // Kill anything still sitting in the send queue for this thread.
  await db
    .from("messages")
    .update({ status: "canceled" })
    .eq("owner_id", ownerId)
    .eq("chat_guid", chatGuid)
    .eq("direction", "out")
    .eq("status", "queued");

  // Stop ALL active sequences for this chat (regardless of stop_on_reply).
  await db
    .from("sequence_enrollments")
    .update({ status: "stopped" })
    .eq("owner_id", ownerId)
    .eq("chat_guid", chatGuid)
    .eq("status", "active");

  // Park the conversation as opted_out and close the lifecycle — a thread we
  // can't message is never "ready for handover". Crucially do NOT set
  // needs_reply, so the AI cron never picks it up.
  const { data: existing } = await db
    .from("conversation_state")
    .select("chat_guid")
    .eq("owner_id", ownerId)
    .eq("chat_guid", chatGuid)
    .maybeSingle();

  if (existing) {
    await db
      .from("conversation_state")
      .update({
        status: "opted_out",
        lifecycle_stage: "closed",
        ai_autopilot: false,
        updated_at: now,
      })
      .eq("owner_id", ownerId)
      .eq("chat_guid", chatGuid);
  } else {
    await db.from("conversation_state").insert({
      owner_id: ownerId,
      chat_guid: chatGuid,
      contact_id: contactId,
      status: "opted_out",
      lifecycle_stage: "closed",
      ai_autopilot: false,
    });
  }
}
