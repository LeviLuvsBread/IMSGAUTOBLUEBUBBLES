import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueBulk, type EnqueueInput } from "@/lib/queue/enqueue";
import { renderForContact } from "@/lib/templating";
import { chatGuidForPhone } from "@/lib/chat";
import type { Contact } from "@/lib/types";

// The in-app "Director" agent. Claude (via OpenRouter) with tool-use: it reads
// data + navigates on its own, and PROPOSES anything that sends/changes data so
// the owner confirms first. Owner-only (the routes auth-gate before calling).

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "anthropic/claude-sonnet-4.5";

export const SYSTEM = `You are "Director", the built-in assistant for the IMSG AUTO iMessage outreach dashboard (Blackbridge Management). You operate the app for the owner by calling tools — you are an agent that DOES things, not a support bot.

How you work:
- To answer questions or find things, call the read tools (find_contacts, get_overview, list_handovers, recent_replies) and reply concisely with the result.
- To SEND texts or CHANGE settings, call send_message / set_paused / set_ai_enabled. The app shows the owner a confirmation (exact recipients + message) before doing it, so be precise and confident.
- To send to people, FIRST call find_contacts to resolve exactly who (you need their ids), THEN call send_message with those ids.
- Use navigate to open a section when the owner says "go to / open / show me".
- Be brief and direct, like texting. Never invent contacts, numbers, or stats — if a tool returns nothing, say so plainly.`;

type ToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: object };
};

export const TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "find_contacts",
      description:
        "Search the owner's contacts by free text (name/phone/company), tag, or company. Returns matches WITH their ids — use the ids for send_message.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "text to match in name/phone/company" },
          tag: { type: "string" },
          company: { type: "string" },
          limit: { type: "integer", description: "max results (default 50)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_overview",
      description:
        "Current status: sent today vs daily cap, queued, failed, leads ready for handover, and whether the AI responder + sending are on/paused.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_handovers",
      description: "Leads the AI marked ready for handover, with each summary.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "recent_replies",
      description: "Most recent inbound replies from merchants.",
      parameters: {
        type: "object",
        properties: { limit: { type: "integer" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_message",
      description:
        "Queue a text to one or more contacts by id. The owner confirms before it sends. Resolve ids with find_contacts first.",
      parameters: {
        type: "object",
        properties: {
          contactIds: { type: "array", items: { type: "string" } },
          body: { type: "string" },
        },
        required: ["contactIds", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_paused",
      description: "Pause or resume ALL outgoing sending.",
      parameters: {
        type: "object",
        properties: { paused: { type: "boolean" } },
        required: ["paused"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_ai_enabled",
      description: "Turn the AI auto-responder on or off.",
      parameters: {
        type: "object",
        properties: { enabled: { type: "boolean" } },
        required: ["enabled"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "navigate",
      description: "Open a page in the app.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            enum: ["/", "/inbox", "/compose", "/contacts", "/templates", "/campaigns", "/scheduler", "/settings"],
          },
        },
        required: ["path"],
      },
    },
  },
];

export const WRITE_TOOLS = new Set(["send_message", "set_paused", "set_ai_enabled"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ChatMsg = { role: string; content: string | null; tool_calls?: any[]; tool_call_id?: string };

export async function callWithTools(messages: ChatMsg[]): Promise<ChatMsg> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not set");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      temperature: 0.3,
      max_tokens: 700,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const data = await res.json();
  return data?.choices?.[0]?.message as ChatMsg;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Args = Record<string, any>;

export async function runReadTool(
  supabase: SupabaseClient,
  name: string,
  args: Args,
): Promise<unknown> {
  if (name === "find_contacts") {
    let q = supabase
      .from("contacts")
      .select("id,name,phone,company,tags,opted_out")
      .limit(Math.min(Number(args.limit) || 50, 200));
    if (args.company) q = q.ilike("company", `%${args.company}%`);
    if (args.tag) q = q.contains("tags", [args.tag]);
    const { data } = await q;
    let rows = (data ?? []) as Contact[];
    if (args.query) {
      const s = String(args.query).toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.name || "").toLowerCase().includes(s) ||
          (r.phone || "").includes(s) ||
          (r.company || "").toLowerCase().includes(s),
      );
    }
    return {
      count: rows.length,
      contacts: rows.slice(0, 50).map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        company: r.company,
        tags: r.tags,
        opted_out: r.opted_out,
      })),
    };
  }
  if (name === "get_overview") {
    const [{ data: s }, queued, failed, handover] = await Promise.all([
      supabase
        .from("app_settings")
        .select("sends_today,daily_cap,paused,ai_enabled,ai_autosend")
        .eq("id", true)
        .maybeSingle(),
      supabase.from("messages").select("*", { count: "exact", head: true }).eq("direction", "out").eq("status", "queued"),
      supabase.from("messages").select("*", { count: "exact", head: true }).eq("status", "failed"),
      supabase.from("conversation_state").select("*", { count: "exact", head: true }).eq("lifecycle_stage", "ready_for_handover"),
    ]);
    return {
      sentToday: s?.sends_today,
      dailyCap: s?.daily_cap,
      paused: s?.paused,
      aiEnabled: s?.ai_enabled,
      autoSend: s?.ai_autosend,
      queued: queued.count,
      failed: failed.count,
      readyForHandover: handover.count,
    };
  }
  if (name === "list_handovers") {
    const { data } = await supabase
      .from("conversation_state")
      .select("chat_guid,handover_summary,contact:contacts(name)")
      .eq("lifecycle_stage", "ready_for_handover")
      .order("ready_at", { ascending: false })
      .limit(20);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return {
      handovers: (data ?? []).map((h: any) => ({
        name: (Array.isArray(h.contact) ? h.contact[0] : h.contact)?.name ?? null,
        chatGuid: h.chat_guid,
        summary: h.handover_summary,
      })),
    };
  }
  if (name === "recent_replies") {
    const { data } = await supabase
      .from("messages")
      .select("body,chat_guid,created_at")
      .eq("direction", "in")
      .order("created_at", { ascending: false })
      .limit(Math.min(Number(args.limit) || 10, 30));
    return { replies: data ?? [] };
  }
  return { error: "unknown tool" };
}

// Human-readable summary the owner confirms before a write runs.
export async function summarizeAction(
  supabase: SupabaseClient,
  name: string,
  args: Args,
): Promise<string> {
  if (name === "send_message") {
    const ids = Array.isArray(args.contactIds) ? args.contactIds : [];
    const { data } = await supabase.from("contacts").select("name,phone,opted_out").in("id", ids);
    const rows = (data ?? []) as { name: string; phone: string; opted_out: boolean }[];
    const active = rows.filter((r) => !r.opted_out);
    const names = active.map((r) => r.name || r.phone).join(", ") || "(none found)";
    const skipped = rows.length - active.length;
    return `Send to ${active.length} contact${active.length === 1 ? "" : "s"}${skipped > 0 ? ` (${skipped} opted-out skipped)` : ""}:\n${names}\n\nMessage:\n“${args.body}”`;
  }
  if (name === "set_paused") return args.paused ? "Pause ALL outgoing sending." : "Resume outgoing sending.";
  if (name === "set_ai_enabled") return args.enabled ? "Turn the AI responder ON." : "Turn the AI responder OFF.";
  return "Run this action.";
}

// Execute a confirmed write tool.
export async function executeAction(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  args: Args,
): Promise<string> {
  if (name === "send_message") {
    const ids = [...new Set((args.contactIds ?? []).filter(Boolean))] as string[];
    const { data } = await supabase.from("contacts").select("*").in("id", ids).eq("opted_out", false);
    const contacts = (data ?? []) as Contact[];
    const inputs: EnqueueInput[] = contacts.map((c) => ({
      ownerId: userId,
      chatGuid: c.chat_guid ?? chatGuidForPhone(c.phone),
      contactId: c.id,
      body: renderForContact(String(args.body ?? ""), c),
      source: "assistant",
    }));
    const n = inputs.length ? await enqueueBulk(supabase, inputs) : 0;
    return `✅ Queued ${n} message${n === 1 ? "" : "s"}. They'll drip out under your throttle.`;
  }
  if (name === "set_paused") {
    await supabase.from("app_settings").update({ paused: !!args.paused, updated_at: new Date().toISOString() }).eq("id", true);
    return args.paused ? "✅ Sending paused." : "✅ Sending resumed.";
  }
  if (name === "set_ai_enabled") {
    await supabase.from("app_settings").update({ ai_enabled: !!args.enabled, updated_at: new Date().toISOString() }).eq("id", true);
    return args.enabled ? "✅ AI responder turned on." : "✅ AI responder turned off.";
  }
  return "Done.";
}
