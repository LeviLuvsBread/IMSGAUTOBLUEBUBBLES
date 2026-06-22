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

export const SYSTEM = `You are "Director", the built-in operator for the IMSG AUTO iMessage outreach dashboard (Blackbridge Management). You don't just answer questions — you DO things by calling tools. Bias hard toward action.

Core rules:
- ACT, don't interrogate. If a tool can find or do what's asked, do it instead of asking the owner to clarify. Only ask a question when a tool genuinely can't resolve it (a real tie between two contacts, or a risky bulk action).
- ALWAYS search before claiming you can't find someone. Call find_contacts first. If a full name returns nothing, retry with just the first name, then just the last name, then the company — names may be stored differently than spoken.
- To text someone: find_contacts to get their id(s), THEN send_message with those ids. The owner gets a confirm card (exact people + message) before anything sends, so propose confidently. Never send to a name you haven't resolved to an id.
- Read tools (find_contacts, get_overview, list_handovers, recent_replies) run instantly — use them freely to ground every answer. Never invent contacts, numbers, or stats; if a tool returns nothing, say so plainly.
- Read intent generously: "pause everything" → set_paused(true); "turn the bot off" → set_ai_enabled(false); "who's ready / any handoffs" → list_handovers; "how are we doing" → get_overview; "open/go to/show me X" → navigate.
- Keep replies short and plain, like texting. Say what you did, not how the tools work.`;

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
    let q = supabase.from("contacts").select("id,name,phone,company,tags,opted_out");
    if (args.company) q = q.ilike("company", `%${args.company}%`);
    if (args.tag) q = q.contains("tags", [args.tag]);
    if (args.query) {
      // Search the WHOLE table at the DB level (not a capped in-memory slice).
      // Sanitize so the value can't break the PostgREST or() filter syntax.
      const s = String(args.query).replace(/[,()*]/g, " ").trim();
      if (s) q = q.or(`name.ilike.%${s}%,company.ilike.%${s}%,phone.ilike.%${s}%`);
    }
    q = q.order("name").limit(Math.min(Number(args.limit) || 50, 200));
    const { data } = await q;
    const rows = (data ?? []) as Contact[];
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
