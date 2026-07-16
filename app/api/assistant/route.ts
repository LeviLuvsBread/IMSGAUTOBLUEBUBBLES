import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  SYSTEM,
  WRITE_TOOLS,
  callWithTools,
  runReadTool,
  summarizeAction,
  type AssistantUpload,
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

  let body: {
    messages?: { role: string; content: string }[];
    upload?: AssistantUpload | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const history = (body.messages ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content }) as ChatMsg);

  // Describe the attached file to the model (headers + a small sample for
  // spreadsheets). Full rows never go through the model — they're injected
  // into the confirm-card args server-side below.
  const upload = body.upload ?? null;
  const uploadNote: ChatMsg[] = upload
    ? [
        {
          role: "system",
          content:
            `Attached file: "${upload.name}" (${upload.mime || "unknown type"}, ${Math.round((upload.size ?? 0) / 1024)} KB).` +
            (upload.kind === "sheet" && upload.headers?.length
              ? `\nSpreadsheet with ${upload.rows?.length ?? 0} data rows.\nColumn headers: ${JSON.stringify(upload.headers)}\nFirst rows: ${JSON.stringify((upload.rows ?? []).slice(0, 8))}`
              : ""),
        },
      ]
    : [];

  const messages: ChatMsg[] = [
    { role: "system", content: SYSTEM },
    ...uploadNote,
    ...history,
  ];

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
          // File tools need the actual upload data — the model only saw a
          // sample, so graft the real thing onto the args here.
          if (name === "import_contacts" || name === "send_file") {
            if (!upload) {
              return NextResponse.json({
                reply:
                  "There's no file attached — add one with the paperclip and ask again.",
              });
            }
            if (name === "import_contacts") {
              if (upload.kind !== "sheet" || !upload.headers?.length) {
                return NextResponse.json({
                  reply:
                    "That file doesn't look like a spreadsheet I can read — attach a CSV or Excel file with a header row.",
                });
              }
              args = {
                ...args,
                headers: upload.headers,
                rows: upload.rows ?? [],
                fileName: upload.name,
              };
            } else {
              args = {
                ...args,
                file: {
                  path: upload.path,
                  name: upload.name,
                  mime: upload.mime,
                  size: upload.size,
                },
              };
            }
          }
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
