import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/webhook/verify";
import { createAdminClient } from "@/lib/supabase/admin";
import { runConversationTurn } from "@/lib/ai/respond";
import type { ConversationState } from "@/lib/types";

export const dynamic = "force-dynamic";
// Each claimed thread runs the full stage pipeline (several LLM calls), so this
// can take a few seconds per thread. Bound the batch + duration.
export const maxDuration = 60;

const BATCH = 5;

async function handle(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const processed: { chatGuid: string; outcome: string }[] = [];

  try {
    // Free up threads stuck mid-pipeline from a crashed prior tick.
    try {
      await admin.rpc("reclaim_stale_generating", { stale_seconds: 180 });
    } catch {
      /* non-fatal */
    }

    for (let i = 0; i < BATCH; i++) {
      const { data, error } = await admin.rpc("claim_next_ai_thread");
      if (error) break;
      const rows = (data ?? []) as ConversationState[];
      if (rows.length === 0) break; // none waiting, or ai disabled / paused
      const row = rows[0];
      try {
        const r = await runConversationTurn(admin, row.owner_id, row.chat_guid);
        processed.push({ chatGuid: row.chat_guid, outcome: r.outcome });
      } catch (e) {
        console.error("[cron/ai] turn error", e);
        // Release the lock so it retries next tick.
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

    return NextResponse.json({ ok: true, processed });
  } catch (e) {
    console.error("[cron/ai] error", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
