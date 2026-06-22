import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WRITE_TOOLS, executeAction } from "@/lib/assistant/agent";

export const dynamic = "force-dynamic";

// Runs a write action AFTER the owner confirmed it in the chat.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { name?: string; args?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!body.name || !WRITE_TOOLS.has(body.name)) {
    return NextResponse.json({ error: "not allowed" }, { status: 400 });
  }

  try {
    const result = await executeAction(supabase, user.id, body.name, body.args ?? {});
    return NextResponse.json({ result });
  } catch (e) {
    console.error("[assistant/execute]", e);
    return NextResponse.json({ result: "Couldn't complete that — try again." });
  }
}
