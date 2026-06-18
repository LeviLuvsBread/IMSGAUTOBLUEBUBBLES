import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/webhook/verify";
import { createAdminClient } from "@/lib/supabase/admin";
import { drainAiThreads } from "@/lib/ai/drain";

export const dynamic = "force-dynamic";
// Backstop sweep. The webhook fires replies instantly on inbound; this catches
// anything missed (cron retries, a webhook that didn't trigger, stale locks).
export const maxDuration = 60;

async function handle(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const processed = await drainAiThreads(createAdminClient(), 5);
    return NextResponse.json({ ok: true, processed });
  } catch (e) {
    console.error("[cron/ai] error", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
