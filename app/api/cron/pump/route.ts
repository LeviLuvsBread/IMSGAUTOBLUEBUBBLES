import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/webhook/verify";
import { runPump } from "@/lib/queue/pump";

export const dynamic = "force-dynamic";
// Bounded; each tick normally issues 0–1 sends (the gate throttles), and each
// BlueBubbles call is aborted after a few seconds, so this stays well under any
// plan's function limit.
export const maxDuration = 60;

async function handle(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runPump(10);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron/pump] error", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
