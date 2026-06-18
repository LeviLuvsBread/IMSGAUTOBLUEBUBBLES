import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversationState } from "@/lib/types";
import { runConversationTurn } from "./respond";

// Claim + process threads that need an AI reply. Shared by the per-minute AI
// cron AND the webhook (fired the instant a text arrives, for near-real-time
// replies). claim_next_ai_thread() is atomic (FOR UPDATE SKIP LOCKED), so the
// immediate trigger and the cron backstop can overlap safely — never a double
// reply.
export async function drainAiThreads(
  admin: SupabaseClient,
  batch = 5,
): Promise<{ chatGuid: string; outcome: string }[]> {
  const processed: { chatGuid: string; outcome: string }[] = [];

  try {
    await admin.rpc("reclaim_stale_generating", { stale_seconds: 180 });
  } catch {
    /* non-fatal */
  }

  for (let i = 0; i < batch; i++) {
    const { data, error } = await admin.rpc("claim_next_ai_thread");
    if (error) break;
    const rows = (data ?? []) as ConversationState[];
    if (rows.length === 0) break; // none waiting, or AI disabled / paused
    const row = rows[0];
    try {
      const r = await runConversationTurn(admin, row.owner_id, row.chat_guid);
      processed.push({ chatGuid: row.chat_guid, outcome: r.outcome });
    } catch (e) {
      console.error("[ai/drain] turn error", e);
      // Release the lock so the cron retries it next tick.
      await admin
        .from("conversation_state")
        .update({
          status: "needs_reply",
          claimed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("owner_id", row.owner_id)
        .eq("chat_guid", row.chat_guid);
      processed.push({ chatGuid: row.chat_guid, outcome: "error" });
    }
  }

  return processed;
}
