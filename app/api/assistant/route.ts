import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  SYSTEM,
  WRITE_TOOLS,
  callWithTools,
  runReadTool,
  summarizeAction,
  type ChatMsg,
} from "@/lib/assistant/agent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The Director agent loop. Owner-only. Read tools run automatically; the first
// write/navigate tool stops the loop and is returned for the client to confirm
// (writes) or run (navigate).
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { messages?: { role: string; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const history = (body.messages ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content }) as ChatMsg);

  const messages: ChatMsg[] = [{ role: "system", content: SYSTEM }, ...history];

  try {
    for (let i = 0; i < 6; i++) {
      const m = await callWithTools(messages);
      if (!m?.tool_calls?.length) {
        return NextResponse.json({ reply: m?.content ?? "…" });
      }
      messages.push({ role: "assistant", content: m.content ?? "", tool_calls: m.tool_calls });

      for (const tc of m.tool_calls) {
        const name = tc.function?.name as string;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function?.arguments || "{}");
        } catch {
          /* ignore */
        }

        if (name === "navigate") {
          return NextResponse.json({
            reply: m.content || `Opening ${args.path}.`,
            action: { kind: "navigate", path: args.path },
          });
        }
        if (WRITE_TOOLS.has(name)) {
          const summary = await summarizeAction(supabase, name, args);
          return NextResponse.json({
            reply: m.content || "",
            action: { kind: "confirm", name, args, summary },
          });
        }
        const result = await runReadTool(supabase, name, args);
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
    }
    return NextResponse.json({ reply: "That took too many steps — try rephrasing?" });
  } catch (e) {
    console.error("[assistant]", e);
    return NextResponse.json({ reply: "Hit a snag reaching the model. Try again in a sec." });
  }
}
