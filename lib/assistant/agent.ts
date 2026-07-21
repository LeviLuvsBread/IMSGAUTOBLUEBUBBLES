import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueBulk, type EnqueueInput } from "@/lib/queue/enqueue";
import { applyOptOut } from "@/lib/queue/opt-out";
import { renderForContact, extractVariables } from "@/lib/templating";
import { chatGuidForPhone, toE164 } from "@/lib/chat";
import { OWNER_TZ } from "@/lib/format";
import type { Contact } from "@/lib/types";

// A file the owner attached in the chat. Spreadsheets also carry parsed rows
// so import_contacts can add them as leads; every upload has a storage path so
// send_file can send it to people.
export type AssistantUpload = {
  kind: "sheet" | "file";
  name: string;
  mime: string;
  size: number;
  path: string; // storage path in the uploads bucket
  headers?: string[];
  rows?: string[][];
};

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
- Read intent generously: "pause everything" → set_paused(true); "who's ready / any handoffs" → list_handovers; "how are we doing" → get_overview; "open/go to/show me X" → navigate.
- The AI writes ONLY the initial opener to each lead — it never replies to conversations; the owner handles every reply personally. If asked to auto-reply or "turn the bot on", explain that replies are owner-only now.
- Edit contacts freely with update_contacts: rename people, fix companies/emails/phones, retag, add notes, mark do-not-text. Bulk cleanups too — e.g. "keep only first names" → find_contacts, then update_contacts with each contact's id and its new name computed from the current one. Omit fields you aren't changing. delete_contacts removes contacts for good (their past messages stay in the inbox, unlinked; anything queued to them is canceled). The owner confirms a card listing the exact changes first, so propose confidently.
- Templates: list_templates to read them, save_template to create or rewrite one (merge tags like {{first_name}}/{{company}} + {a|b|c} spintax variation), delete_template to remove one. Add individual people with create_contacts (name + phone); spreadsheets still go through import_contacts.
- Settings: update_settings changes message spacing, jitter, daily cap, and the send window. Spacing under 2-3 minutes risks the number getting flagged — warn before proposing less unless the owner insists.
- Big cleanups: work in batches. Keep each update_contacts call to ~40 edits and make ONE tool call per reply — extra calls in the same reply are dropped. find_contacts pages with offset: if total > returned, fetch the next page (offset + returned) until you've seen everyone. After the owner confirms a batch, tell them what's left and continue with the next batch when they say to. If a batch renamed or deleted contacts, old offsets are stale — re-run find_contacts from offset 0 for the next batch.
- Files: the owner can attach a file with the paperclip — you'll see an "Attached file" note with its details. A spreadsheet (CSV/Excel): call import_contacts with a mapping from fields to the EXACT column headers shown, to add the rows as leads; afterwards you can find_contacts / send_message to them like anyone else. ANY attached file can be sent to people with send_file (resolve contact ids with find_contacts first). If they ask you to use a file but nothing is attached, tell them to attach it with the paperclip.
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
        "Search the owner's contacts by free text (name/phone/company), tag, or company. Returns matches WITH their ids — use the ids for send_message/update_contacts/delete_contacts. Returns up to `limit` (max 200) per call plus the true `total`; if total > offset + returned, call again with a larger offset to page through the rest.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "text to match in name/phone/company" },
          tag: { type: "string" },
          company: { type: "string" },
          limit: { type: "integer", description: "max results per page (default 50, max 200)" },
          offset: { type: "integer", description: "skip this many matches — for paging past the first `limit`" },
          addedAfter: { type: "string", description: "only contacts added at/after this time. For 'the leads I uploaded on <date>' just pass that date as YYYY-MM-DD — date-only and offset-less values are read in the owner's timezone." },
          addedBefore: { type: "string", description: "only contacts added before this time — pair with addedAfter to bracket one upload date (addedAfter: the date, addedBefore: the next day)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_overview",
      description:
        "Current status: sent today vs daily cap, queued, failed, leads ready for handover, and whether sending is paused.",
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
      name: "import_contacts",
      description:
        "Import the attached spreadsheet's rows as contacts/leads. mapping maps contact fields to the EXACT column header names from the upload (phone is required; use full OR first+last for the name). Owner confirms before it runs.",
      parameters: {
        type: "object",
        properties: {
          mapping: {
            type: "object",
            properties: {
              phone: { type: "string", description: "header of the phone column (required)" },
              full: { type: "string", description: "header of a full-name column" },
              first: { type: "string" },
              last: { type: "string" },
              email: { type: "string" },
              company: { type: "string" },
              tags: { type: "string", description: "header of a tags column" },
            },
            required: ["phone"],
          },
          tagAll: { type: "string", description: "optional tag applied to every imported contact" },
        },
        required: ["mapping"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_contacts",
      description:
        "Edit one or more existing contacts (keep batches to ~40 edits; make more calls for more). Each edit names a contact id (from find_contacts) and only the fields to change — omitted fields keep their current value. Empty string clears company/email/notes; name can't be cleared. opted_out true = do-not-text (also cancels their queued sends and stops their sequences); false re-allows outreach only. Owner confirms the exact changes before it runs.",
      parameters: {
        type: "object",
        properties: {
          edits: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "contact id from find_contacts" },
                name: { type: "string" },
                company: { type: "string" },
                email: { type: "string" },
                phone: { type: "string" },
                notes: { type: "string" },
                tags: { type: "array", items: { type: "string" }, description: "replaces ALL tags — include existing ones to keep them" },
                opted_out: { type: "boolean" },
              },
              required: ["id"],
            },
          },
        },
        required: ["edits"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_contacts",
      description:
        "Permanently delete contacts by id (from find_contacts). Cancels anything queued to them and stops their sequences; their past messages stay in the inbox but are unlinked. Owner confirms before it runs.",
      parameters: {
        type: "object",
        properties: {
          ids: { type: "array", items: { type: "string" } },
        },
        required: ["ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_file",
      description:
        "Send the attached file (photo, PDF, any document) to one or more contacts by id, with an optional text caption. Queued under the send throttle; the owner confirms first. Resolve ids with find_contacts.",
      parameters: {
        type: "object",
        properties: {
          contactIds: { type: "array", items: { type: "string" } },
          caption: { type: "string", description: "optional text sent along with the file" },
        },
        required: ["contactIds"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_templates",
      description: "All saved outreach templates with their ids and bodies.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "save_template",
      description:
        "Create a template, or rewrite an existing one when id is given. Bodies support {{first_name}}/{{name}}/{{company}}-style merge tags and {a|b|c} spintax. Owner confirms before it saves.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "existing template id (from list_templates) to update; omit to create new" },
          name: { type: "string" },
          body: { type: "string" },
        },
        required: ["name", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_template",
      description: "Permanently delete a template by id (from list_templates). Owner confirms first.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_contacts",
      description:
        "Add one or more contacts directly (no spreadsheet needed) — phone is required per person, name/email/company/tags/notes optional. Numbers already in the list are skipped. Owner confirms first.",
      parameters: {
        type: "object",
        properties: {
          contacts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                phone: { type: "string" },
                email: { type: "string" },
                company: { type: "string" },
                notes: { type: "string" },
                tags: { type: "array", items: { type: "string" } },
              },
              required: ["phone"],
            },
          },
          tagAll: { type: "string", description: "optional tag applied to every added contact" },
        },
        required: ["contacts"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_settings",
      description:
        "Change sending settings: minDelaySeconds (spacing between texts), jitterSeconds (random extra spacing), dailyCap, sendWindowStart/sendWindowEnd (local hours 0-23), or sendAnytime true to remove the window. Only pass what should change. Owner confirms first.",
      parameters: {
        type: "object",
        properties: {
          minDelaySeconds: { type: "integer" },
          jitterSeconds: { type: "integer" },
          dailyCap: { type: "integer" },
          sendWindowStart: { type: "integer" },
          sendWindowEnd: { type: "integer" },
          sendAnytime: { type: "boolean" },
        },
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

export const WRITE_TOOLS = new Set([
  "send_message",
  "set_paused",
  "import_contacts",
  "send_file",
  "update_contacts",
  "delete_contacts",
  "save_template",
  "delete_template",
  "create_contacts",
  "update_settings",
]);

// ---- spreadsheet import helpers (shared by summarize + execute) ----

type ImportMapping = {
  phone?: string;
  full?: string;
  first?: string;
  last?: string;
  email?: string;
  company?: string;
  tags?: string;
};

const splitTags = (s: string) =>
  s.split(/[;,]/).map((t) => t.trim()).filter(Boolean);

// Resolve mapping header names → column indexes (case-insensitive), then build
// contact rows the same way the Contacts import screen does.
function buildImportRows(
  headers: string[],
  rows: string[][],
  mapping: ImportMapping,
  tagAll?: string,
) {
  const norm = (h: string) => h.trim().toLowerCase();
  const idx = (h?: string) => {
    if (!h) return -1;
    const i = headers.findIndex((x) => norm(x) === norm(h));
    return i;
  };
  const col = {
    phone: idx(mapping.phone),
    full: idx(mapping.full),
    first: idx(mapping.first),
    last: idx(mapping.last),
    email: idx(mapping.email),
    company: idx(mapping.company),
    tags: idx(mapping.tags),
  };
  const val = (row: string[], i: number) => (i >= 0 ? String(row[i] ?? "").trim() : "");
  const tagAllList = splitTags(tagAll ?? "");

  const seen = new Set<string>();
  const out: { name: string; phone: string; email: string; company: string; tags: string[] }[] = [];
  let skippedNoPhone = 0;
  let dupes = 0;
  for (const row of rows) {
    const phone = toE164(val(row, col.phone));
    if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
      skippedNoPhone++;
      continue;
    }
    if (seen.has(phone)) {
      dupes++;
      continue;
    }
    seen.add(phone);
    const full = val(row, col.full);
    const name =
      full || `${val(row, col.first)} ${val(row, col.last)}`.trim() || val(row, col.company) || phone;
    out.push({
      name,
      phone,
      email: val(row, col.email),
      company: val(row, col.company),
      tags: [...splitTags(val(row, col.tags)), ...tagAllList],
    });
  }
  return { contacts: out, skippedNoPhone, dupes };
}

// ---- contact edit helpers (shared by summarize + execute) ----

const E164_RE = /^\+[1-9]\d{6,14}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_EDITS = 200;

type ContactEdit = { id: string; patch: Record<string, unknown>; invalidPhone: boolean };

// One requested contact edit, sanitized the same way saveContact treats the
// edit form: strings trimmed, ""→null for clearable fields, phone normalized
// to E164 (recomputing chat_guid), name never cleared.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildContactEdit(raw: any): ContactEdit {
  const id = String(raw?.id ?? "").trim();
  const patch: Record<string, unknown> = {};
  let invalidPhone = false;

  if (typeof raw?.name === "string" && raw.name.trim()) patch.name = raw.name.trim();
  for (const f of ["company", "email", "notes"] as const) {
    if (typeof raw?.[f] === "string") patch[f] = raw[f].trim() || null;
  }
  const phoneRaw =
    typeof raw?.phone === "string" || typeof raw?.phone === "number" ? String(raw.phone).trim() : "";
  if (phoneRaw) {
    const phone = toE164(phoneRaw);
    if (E164_RE.test(phone)) {
      patch.phone = phone;
      patch.chat_guid = chatGuidForPhone(phone);
    } else {
      invalidPhone = true;
    }
  }
  if (Array.isArray(raw?.tags)) {
    patch.tags = raw.tags
      .filter((t: unknown): t is string => typeof t === "string")
      .map((t: string) => t.trim())
      .filter(Boolean);
  }
  if (typeof raw?.opted_out === "boolean") patch.opted_out = raw.opted_out;
  else if (raw?.opted_out === "true" || raw?.opted_out === "false")
    patch.opted_out = raw.opted_out === "true";

  return { id, patch, invalidPhone };
}

// Confirm-card wording for a patch ("name → “Sarah”, clear company, …").
function describePatch(patch: Record<string, unknown>): string[] {
  const out: string[] = [];
  if ("name" in patch) out.push(`name → “${patch.name}”`);
  for (const f of ["company", "email", "notes"] as const) {
    if (f in patch) out.push(patch[f] ? `${f} → “${patch[f]}”` : `clear ${f}`);
  }
  if ("phone" in patch) out.push(`phone → ${patch.phone}`);
  if ("tags" in patch) {
    const tags = patch.tags as string[];
    out.push(tags.length ? `tags → ${tags.join(", ")}` : "clear tags");
  }
  if ("opted_out" in patch) out.push(patch.opted_out ? "mark do-not-text" : "allow texting again");
  return out;
}

// Sanitize + merge the model's edits: non-uuid ids are dropped (one malformed
// id would otherwise poison batched lookups), duplicate ids merge into a
// single edit (later fields win) so counts reflect distinct contacts.
function parseContactEdits(args: Args): ContactEdit[] {
  const rawEdits = Array.isArray(args.edits) ? args.edits.slice(0, MAX_EDITS) : [];
  const byId = new Map<string, ContactEdit>();
  for (const raw of rawEdits) {
    const e = buildContactEdit(raw);
    if (!UUID_RE.test(e.id)) continue;
    if (Object.keys(e.patch).length === 0 && !e.invalidPhone) continue;
    const prev = byId.get(e.id);
    if (prev) {
      Object.assign(prev.patch, e.patch);
      prev.invalidPhone = prev.invalidPhone || e.invalidPhone;
    } else {
      byId.set(e.id, e);
    }
  }
  return [...byId.values()];
}

// Minutes east of UTC for the owner's timezone at a given instant (DST-aware),
// derived via Intl — e.g. -240 for EDT, -300 for EST.
function ownerTzOffsetMinutes(ts: number): number {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone: OWNER_TZ, timeZoneName: "longOffset" })
      .formatToParts(ts)
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

// Parse a model-supplied timestamp. Date-only and offset-less strings are wall
// time in the OWNER'S timezone — Date.parse would read "2026-07-15" as UTC
// midnight (8 PM the previous evening in ET on UTC Vercel), silently putting
// evening upload batches on the wrong day. Returns null when absent,
// "invalid" when unparseable so the caller can surface an error.
function parseWhen(v: unknown): string | null | "invalid" {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") return "invalid";
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(v.trim());
  if (m) {
    const [y, mo, d, h, mi, s] = [
      +m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0),
    ];
    const wall = Date.UTC(y, mo - 1, d, h, mi, s);
    // Two passes so the offset is taken at (roughly) the resulting instant —
    // handles DST transition days correctly.
    let ts = wall - ownerTzOffsetMinutes(wall) * 60000;
    ts = wall - ownerTzOffsetMinutes(ts) * 60000;
    return new Date(ts).toISOString();
  }
  const t = Date.parse(v);
  return Number.isNaN(t) ? "invalid" : new Date(t).toISOString();
}

// ---- create_contacts / update_settings helpers (shared summarize + execute) ----

type NewContact = {
  name: string;
  phone: string;
  email: string;
  company: string;
  tags: string[];
  notes: string | null;
};

function buildNewContacts(args: Args): {
  rows: NewContact[];
  badPhone: number;
  dupes: number;
  dropped: number;
} {
  const listRaw = Array.isArray(args.contacts) ? args.contacts : [];
  const list = listRaw.slice(0, 500);
  const dropped = listRaw.length - list.length;
  const tagAllList = splitTags(String(args.tagAll ?? ""));
  const seen = new Set<string>();
  const rows: NewContact[] = [];
  let badPhone = 0;
  let dupes = 0;
  for (const raw of list) {
    const phone = toE164(String(raw?.phone ?? ""));
    if (!E164_RE.test(phone)) {
      badPhone++;
      continue;
    }
    if (seen.has(phone)) {
      dupes++;
      continue;
    }
    seen.add(phone);
    const name = String(raw?.name ?? "").trim();
    const company = String(raw?.company ?? "").trim();
    rows.push({
      name: name || company || phone,
      phone,
      email: String(raw?.email ?? "").trim(),
      company,
      tags: [
        ...(Array.isArray(raw?.tags)
          ? raw.tags
              .filter((t: unknown): t is string => typeof t === "string")
              .map((t: string) => t.trim())
              .filter(Boolean)
          : []),
        ...tagAllList,
      ],
      notes: String(raw?.notes ?? "").trim() || null,
    });
  }
  return { rows, badPhone, dupes, dropped };
}

// Sanitized app_settings patch + confirm-card lines. Values are clamped to
// sane ranges; a spacing under 2 min gets a loud warning (the number was
// already spam-flagged once — spacing is the main protection).
type StoredWindow = { send_window_start: number | null; send_window_end: number | null };

function buildSettingsPatch(
  args: Args,
  current: StoredWindow,
): {
  patch: Record<string, unknown>;
  lines: string[];
  warnings: string[];
} {
  const patch: Record<string, unknown> = {};
  const lines: string[] = [];
  const warnings: string[] = [];
  const num = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
    return null;
  };
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

  const md = num(args.minDelaySeconds);
  if (md !== null) {
    patch.min_delay_seconds = clamp(md, 0, 3600);
    lines.push(`message spacing → at least ${patch.min_delay_seconds}s apart`);
  }
  const jt = num(args.jitterSeconds);
  if (jt !== null) {
    patch.jitter_seconds = clamp(jt, 0, 3600);
    lines.push(`random jitter → up to ${patch.jitter_seconds}s extra`);
  }
  const dc = num(args.dailyCap);
  if (dc !== null) {
    patch.daily_cap = clamp(dc, 1, 1000);
    lines.push(`daily cap → ${patch.daily_cap} texts/day`);
  }
  if (args.sendAnytime === true) {
    patch.send_window_start = null;
    patch.send_window_end = null;
    lines.push("send window → anytime (no hour limits)");
  } else {
    const ws = num(args.sendWindowStart);
    const we = num(args.sendWindowEnd);
    if (ws !== null) patch.send_window_start = clamp(ws, 0, 23);
    if (we !== null) patch.send_window_end = clamp(we, 0, 23);
    if (ws !== null || we !== null) {
      // Validate the EFFECTIVE window (patch merged over stored values): the
      // DB gate blocks every hour when start >= end, which would silently
      // halt all sending with zero errors anywhere.
      const effStart = (patch.send_window_start ?? current.send_window_start) as number | null;
      const effEnd = (patch.send_window_end ?? current.send_window_end) as number | null;
      if (effStart !== null && effEnd !== null && effStart >= effEnd) {
        delete patch.send_window_start;
        delete patch.send_window_end;
        warnings.push(
          `⚠️ a ${effStart}:00–${effEnd}:00 window would block EVERY hour and stop all sending (start must be before end; overnight windows aren't supported) — window left unchanged`,
        );
      } else {
        if (patch.send_window_start !== undefined)
          lines.push(`send window opens → ${patch.send_window_start}:00`);
        if (patch.send_window_end !== undefined)
          lines.push(`send window closes → ${patch.send_window_end}:00`);
        if ((effStart === null) !== (effEnd === null)) {
          warnings.push(
            "note: the window only kicks in once BOTH open and close hours are set — the other side is currently unset, so texts still go out at any hour",
          );
        }
      }
    }
  }
  if (typeof patch.min_delay_seconds === "number" && patch.min_delay_seconds < 120) {
    warnings.push("⚠️ spacing under 2 minutes — risky for the number after the earlier Apple flag");
  }
  return { patch, lines, warnings };
}

async function storedWindow(supabase: SupabaseClient): Promise<StoredWindow> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("send_window_start,send_window_end")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    send_window_start: (data?.send_window_start ?? null) as number | null,
    send_window_end: (data?.send_window_end ?? null) as number | null,
  };
}

// Which template save_template targets: an explicit uuid id, else an existing
// template with the same (case-insensitive) name — so "rewrite my Opener"
// without an id updates Opener instead of silently forking a duplicate.
async function resolveTemplateId(
  supabase: SupabaseClient,
  args: Args,
  tName: string,
): Promise<string | null> {
  if (typeof args.id === "string" && UUID_RE.test(args.id)) return args.id;
  const { data, error } = await supabase.from("templates").select("id,name").limit(200);
  if (error) throw new Error(error.message);
  const hit = (data ?? []).find(
    (t) => String(t.name ?? "").trim().toLowerCase() === tName.toLowerCase(),
  );
  return hit ? (hit.id as string) : null;
}

const uniqueUuids = (v: unknown): string[] => [
  ...new Set(
    (Array.isArray(v) ? v : []).map((x) => String(x ?? "").trim()).filter((x) => UUID_RE.test(x)),
  ),
];

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
      // Roomy enough for a ~40-edit update_contacts tool call (uuids are
      // token-heavy); replies stay short because the prompt demands it.
      max_tokens: 4000,
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
      .select("id,name,phone,company,email,notes,tags,opted_out", { count: "exact" });
    if (args.company) q = q.ilike("company", `%${args.company}%`);
    if (args.tag) q = q.contains("tags", [args.tag]);
    // "The leads I added on <date>" — bracket created_at. Invalid values are
    // an ERROR back to the model, never silently dropped: a vanished filter
    // would return the whole table while the model believes it's one upload.
    const after = parseWhen(args.addedAfter);
    const before = parseWhen(args.addedBefore);
    if (after === "invalid" || before === "invalid") {
      return {
        error:
          "addedAfter/addedBefore wasn't a parseable timestamp. Pass a date like 2026-07-15 (interpreted as the owner's timezone) or a full ISO timestamp with offset.",
      };
    }
    if (after) q = q.gte("created_at", after);
    if (before) q = q.lt("created_at", before);
    if (args.query) {
      // Search the WHOLE table at the DB level (not a capped in-memory slice).
      // Sanitize so the value can't break the PostgREST or() filter syntax.
      const s = String(args.query).replace(/[,()*]/g, " ").trim();
      if (s) q = q.or(`name.ilike.%${s}%,company.ilike.%${s}%,phone.ilike.%${s}%`);
    }
    // Paged so bulk jobs can walk the whole list: total is the true match
    // count; the model advances offset until offset + returned >= total.
    const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 200);
    const offset = Math.max(Number(args.offset) || 0, 0);
    // Secondary sort on id: name alone is non-unique, and unstable ordering
    // across LIMIT/OFFSET pages would skip or repeat contacts mid-bulk-job.
    q = q.order("name").order("id").range(offset, offset + limit - 1);
    const { data, count } = await q;
    const rows = (data ?? []) as Contact[];
    return {
      total: count ?? rows.length,
      offset,
      returned: rows.length,
      contacts: rows.map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        company: r.company,
        email: r.email,
        notes: r.notes,
        tags: r.tags,
        opted_out: r.opted_out,
      })),
    };
  }
  if (name === "list_templates") {
    const { data } = await supabase
      .from("templates")
      .select("id,name,body,updated_at")
      .order("name")
      .limit(100);
    return { templates: data ?? [] };
  }
  if (name === "get_overview") {
    const [{ data: s }, queued, failed, handover] = await Promise.all([
      supabase
        .from("app_settings")
        .select("sends_today,daily_cap,paused")
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

// Human-readable summary the owner confirms before a write runs. Returns null
// when the action has no real targets — the route then skips the confirm card
// and feeds the problem back to the model instead.
export async function summarizeAction(
  supabase: SupabaseClient,
  name: string,
  args: Args,
): Promise<string | null> {
  if (name === "send_message") {
    const ids = uniqueUuids(args.contactIds);
    const { data } = await supabase.from("contacts").select("name,phone,opted_out").in("id", ids);
    const rows = (data ?? []) as { name: string; phone: string; opted_out: boolean }[];
    const active = rows.filter((r) => !r.opted_out);
    const names = active.map((r) => r.name || r.phone).join(", ") || "(none found)";
    const skipped = rows.length - active.length;
    return `Send to ${active.length} contact${active.length === 1 ? "" : "s"}${skipped > 0 ? ` (${skipped} opted-out skipped)` : ""}:\n${names}\n\nMessage:\n“${args.body}”`;
  }
  if (name === "set_paused") return args.paused ? "Pause ALL outgoing sending." : "Resume outgoing sending.";
  if (name === "save_template") {
    const tName = String(args.name ?? "").trim();
    const body = String(args.body ?? "").trim();
    if (!tName || !body) return null;
    const id = await resolveTemplateId(supabase, args, tName);
    let header = `Create template “${tName}”`;
    if (id) {
      const { data } = await supabase.from("templates").select("name").eq("id", id).maybeSingle();
      if (!data) return null;
      const oldName = String((data as { name: string }).name ?? "");
      header =
        oldName.trim().toLowerCase() === tName.toLowerCase()
          ? `Rewrite template “${oldName}”`
          : `Rewrite template “${oldName}” as “${tName}”`;
    }
    const preview = body.length > 400 ? `${body.slice(0, 400)}…` : body;
    return `${header}:\n\n${preview}`;
  }
  if (name === "delete_template") {
    const id = typeof args.id === "string" && UUID_RE.test(args.id) ? args.id : null;
    if (!id) return null;
    const { data } = await supabase.from("templates").select("name").eq("id", id).maybeSingle();
    if (!data) return null;
    // Anything set to render this template at fire time keeps its wording
    // (frozen at delete) — surface that so the owner knows nothing goes blank.
    const { data: scheds } = await supabase
      .from("scheduled_sends")
      .select("id")
      .eq("template_id", id)
      .in("status", ["active", "paused"]);
    const { data: seqs } = await supabase.from("sequences").select("id,steps");
    const seqCount = ((seqs ?? []) as { steps?: { template_id?: string | null }[] }[]).filter(
      (s) => Array.isArray(s.steps) && s.steps.some((st) => st?.template_id === id),
    ).length;
    const schedCount = scheds?.length ?? 0;
    const refNote =
      schedCount || seqCount
        ? `\n\nIt's still used by ${schedCount} scheduled send${schedCount === 1 ? "" : "s"} and ${seqCount} sequence${seqCount === 1 ? "" : "s"} — their wording will be frozen as it reads today so nothing goes out blank.`
        : "";
    return `Delete the template “${(data as { name: string }).name}” permanently.${refNote}`;
  }
  if (name === "create_contacts") {
    const { rows, badPhone, dupes, dropped } = buildNewContacts(args);
    if (rows.length === 0) return null;
    const shown = rows.slice(0, 10).map((r) => `• ${r.name} — ${r.phone}`);
    const notes = [
      rows.length > shown.length ? `…and ${rows.length - shown.length} more` : "",
      badPhone > 0 ? `${badPhone} skipped (no valid phone)` : "",
      dupes > 0 ? `${dupes} duplicate number${dupes === 1 ? "" : "s"} in the list` : "",
      dropped > 0 ? `${dropped} more didn't fit this call — add the rest in a second call` : "",
    ].filter(Boolean);
    return `Add ${rows.length} contact${rows.length === 1 ? "" : "s"}:\n${shown.join("\n")}${notes.length ? `\n(${notes.join(" · ")})` : ""}`;
  }
  if (name === "update_settings") {
    const { patch, lines, warnings } = buildSettingsPatch(args, await storedWindow(supabase));
    if (Object.keys(patch).length === 0) return null;
    return `Update sending settings:\n${lines.map((l) => `• ${l}`).join("\n")}${warnings.length ? `\n\n${warnings.join("\n")}` : ""}`;
  }
  if (name === "import_contacts") {
    const headers = (args.headers ?? []) as string[];
    const rows = (args.rows ?? []) as string[][];
    const { contacts, skippedNoPhone, dupes } = buildImportRows(
      headers,
      rows,
      (args.mapping ?? {}) as ImportMapping,
      args.tagAll,
    );
    const extras = [
      skippedNoPhone > 0 ? `${skippedNoPhone} skipped (no valid phone)` : "",
      dupes > 0 ? `${dupes} duplicate rows` : "",
    ]
      .filter(Boolean)
      .join(", ");
    return `Import ${contacts.length} lead${contacts.length === 1 ? "" : "s"} from “${args.fileName ?? "the uploaded file"}”${args.tagAll ? `, tagged "${args.tagAll}"` : ""}.${extras ? `\n(${extras})` : ""}`;
  }
  if (name === "update_contacts") {
    const edits = parseContactEdits(args);
    if (edits.length === 0) return null;
    const { data, error } = await supabase
      .from("contacts")
      .select("id,name,phone,opted_out")
      .in("id", edits.map((e) => e.id));
    // Never render a card from a failed lookup — it would claim "0 contacts"
    // while confirming still edits whatever rows actually exist.
    if (error) throw new Error(error.message);
    const byId = new Map((data ?? []).map((c) => [c.id, c as { id: string; name: string; phone: string; opted_out: boolean }]));
    const lines: string[] = [];
    let missing = 0;
    let badPhones = 0;
    let reEnabled = 0;
    for (const e of edits) {
      const c = byId.get(e.id);
      if (!c) {
        missing++;
        if (e.invalidPhone) badPhones++;
        continue;
      }
      if (e.invalidPhone) badPhones++;
      if (e.patch.opted_out === false && c.opted_out) reEnabled++;
      const changes = describePatch(e.patch);
      if (changes.length) lines.push(`• ${c.name || c.phone}: ${changes.join(", ")}`);
    }
    if (lines.length === 0) return null;
    const shown = lines.slice(0, 10);
    const more = lines.length - shown.length;
    const notes = [
      more > 0 ? `…and ${more} more` : "",
      reEnabled > 0 ? `⚠️ re-enables texting for ${reEnabled} opted-out contact${reEnabled === 1 ? "" : "s"}` : "",
      badPhones > 0 ? `${badPhones} phone change${badPhones === 1 ? "" : "s"} skipped (not a valid number)` : "",
      missing > 0 ? `${missing} id${missing === 1 ? "" : "s"} not found — skipped` : "",
    ].filter(Boolean);
    const n = lines.length;
    return `Edit ${n} contact${n === 1 ? "" : "s"}:\n${shown.join("\n")}${notes.length ? `\n(${notes.join(" · ")})` : ""}`;
  }
  if (name === "delete_contacts") {
    const ids = uniqueUuids(args.ids);
    if (ids.length === 0) return null;
    const { data, error } = await supabase.from("contacts").select("name,phone").in("id", ids);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { name: string; phone: string }[];
    if (rows.length === 0) return null;
    const names = rows.slice(0, 12).map((r) => r.name || r.phone).join(", ");
    const more = rows.length - Math.min(rows.length, 12);
    return `⚠️ PERMANENTLY delete ${rows.length} contact${rows.length === 1 ? "" : "s"}:\n${names}${more > 0 ? ` …and ${more} more` : ""}\n\nAnything queued to them is canceled and their sequences stop. Past messages stay in the inbox, but this can't be undone.`;
  }
  if (name === "send_file") {
    const ids = uniqueUuids(args.contactIds);
    const { data } = await supabase.from("contacts").select("name,phone,opted_out").in("id", ids);
    const rows = (data ?? []) as { name: string; phone: string; opted_out: boolean }[];
    const active = rows.filter((r) => !r.opted_out);
    const names = active.map((r) => r.name || r.phone).join(", ") || "(none found)";
    const skipped = rows.length - active.length;
    const file = (args.file ?? {}) as { name?: string };
    return `Send “${file.name ?? "the uploaded file"}” to ${active.length} contact${active.length === 1 ? "" : "s"}${skipped > 0 ? ` (${skipped} opted-out skipped)` : ""}:\n${names}${args.caption ? `\n\nWith message:\n“${args.caption}”` : ""}`;
  }
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
    const ids = uniqueUuids(args.contactIds);
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
  if (name === "import_contacts") {
    const headers = (args.headers ?? []) as string[];
    const rows = (args.rows ?? []) as string[][];
    const { contacts, skippedNoPhone, dupes } = buildImportRows(
      headers,
      rows,
      (args.mapping ?? {}) as ImportMapping,
      args.tagAll,
    );
    if (contacts.length === 0)
      return "No rows had a valid phone number — nothing was imported.";
    let inserted = 0;
    for (let i = 0; i < contacts.length; i += 200) {
      const batch = contacts.slice(i, i + 200).map((c) => ({
        owner_id: userId,
        name: c.name,
        phone: c.phone,
        email: c.email || null,
        company: c.company || null,
        tags: c.tags,
        chat_guid: chatGuidForPhone(c.phone),
      }));
      const { data, error } = await supabase
        .from("contacts")
        .upsert(batch, { onConflict: "owner_id,phone", ignoreDuplicates: true })
        .select("id");
      if (error) throw new Error(error.message);
      inserted += data?.length ?? 0;
    }
    const already = contacts.length - inserted;
    return `✅ Imported ${inserted} lead${inserted === 1 ? "" : "s"}${already > 0 ? ` (${already} already in your list)` : ""}${skippedNoPhone > 0 ? ` · ${skippedNoPhone} skipped, no valid phone` : ""}${dupes > 0 ? ` · ${dupes} duplicate rows` : ""}.`;
  }
  if (name === "send_file") {
    const file = (args.file ?? {}) as {
      path?: string;
      name?: string;
      mime?: string;
      size?: number;
    };
    if (!file.path) return "No file is attached — attach one with the paperclip first.";
    const ids = uniqueUuids(args.contactIds);
    const { data } = await supabase.from("contacts").select("*").in("id", ids).eq("opted_out", false);
    const contacts = (data ?? []) as Contact[];
    if (contacts.length === 0) return "None of those contacts are messageable (missing or opted out).";
    const inputs: EnqueueInput[] = contacts.map((c) => ({
      ownerId: userId,
      chatGuid: c.chat_guid ?? chatGuidForPhone(c.phone),
      contactId: c.id,
      body: String(args.caption ?? "").trim(),
      source: "assistant",
      attachments: [
        {
          storage_path: file.path!,
          name: file.name ?? null,
          mime: file.mime ?? null,
          size: file.size ?? null,
        },
      ],
    }));
    try {
      const n = await enqueueBulk(supabase, inputs);
      return `✅ Queued “${file.name ?? "file"}” to ${n} contact${n === 1 ? "" : "s"}. It'll drip out under your throttle.`;
    } catch (e) {
      if (String(e).includes("attachments"))
        return "⚠️ The attachments database column isn't set up yet — run migration 0006 in Supabase, then try again.";
      throw e;
    }
  }
  if (name === "update_contacts") {
    const all = parseContactEdits(args);
    const badPhones = all.filter((e) => e.invalidPhone).length;
    const edits = all.filter((e) => Object.keys(e.patch).length > 0);
    if (edits.length === 0) return "No valid changes to apply — nothing was edited.";
    // Current rows up front: opt-outs below need each contact's PRE-update
    // chat_guid. A failed lookup must abort — proceeding would apply flags but
    // silently skip the queue/sequence cleanup those flags promise.
    const { data: current, error: lookupErr } = await supabase
      .from("contacts")
      .select("id,phone,chat_guid")
      .in("id", edits.map((e) => e.id));
    if (lookupErr) throw new Error(lookupErr.message);
    const byId = new Map((current ?? []).map((c) => [c.id, c as { id: string; phone: string; chat_guid: string | null }]));
    let updated = 0;
    let failed = 0;
    for (const e of edits) {
      const { data, error } = await supabase
        .from("contacts")
        .update({ ...e.patch, updated_at: new Date().toISOString() })
        .eq("id", e.id)
        .select("id");
      if (error || !data?.length) {
        failed++;
        continue;
      }
      updated++;
      // "Do-not-text" means the FULL routine, same as the app's opt-out
      // surfaces: cancel queued sends, stop sequences, park the conversation —
      // not just the flag, or already-queued campaign texts would still fire.
      // Queued rows are keyed to the PRE-update guid (snapshotted at enqueue),
      // so clean the old thread first; if the same edit changed the phone,
      // park the new number's thread too so nothing re-engages there.
      if (e.patch.opted_out === true) {
        const c = byId.get(e.id);
        const oldGuid = c?.chat_guid ?? (c?.phone ? chatGuidForPhone(c.phone) : null);
        if (oldGuid) await applyOptOut(supabase, userId, oldGuid, e.id);
        const newGuid = e.patch.chat_guid as string | undefined;
        if (newGuid && newGuid !== oldGuid) await applyOptOut(supabase, userId, newGuid, e.id);
      }
    }
    return `✅ Updated ${updated} contact${updated === 1 ? "" : "s"}${failed > 0 ? ` · ${failed} not found/failed` : ""}${badPhones > 0 ? ` · ${badPhones} invalid phone number${badPhones === 1 ? "" : "s"} skipped` : ""}.`;
  }
  if (name === "delete_contacts") {
    const ids = uniqueUuids(args.ids);
    if (ids.length === 0) return "No contacts given — nothing was deleted.";
    // Before the rows vanish, make sure the person stops hearing from us:
    // cancel queued sends, stop sequences, close the conversation. Otherwise
    // "deleted" contacts would keep receiving campaign/sequence texts.
    const { data: victims, error: victimsErr } = await supabase
      .from("contacts")
      .select("id,phone,chat_guid")
      .in("id", ids);
    // A failed lookup must abort BEFORE the delete: once the rows are gone the
    // guids are unrecoverable and the queued sends could never be cleaned up.
    if (victimsErr) throw new Error(victimsErr.message);
    for (const v of (victims ?? []) as { id: string; phone: string; chat_guid: string | null }[]) {
      const guid = v.chat_guid ?? (v.phone ? chatGuidForPhone(v.phone) : null);
      if (guid) await applyOptOut(supabase, userId, guid, null);
    }
    const { data, error } = await supabase.from("contacts").delete().in("id", ids).select("id");
    if (error) throw new Error(error.message);
    const n = data?.length ?? 0;
    return `✅ Deleted ${n} contact${n === 1 ? "" : "s"} — canceled anything queued to them and stopped their sequences. Past messages are still in the inbox.`;
  }
  if (name === "save_template") {
    const tName = String(args.name ?? "").trim();
    const body = String(args.body ?? "").trim();
    if (!tName || !body) return "The template needs both a name and a body — nothing was saved.";
    const id = await resolveTemplateId(supabase, args, tName);
    const row = {
      name: tName,
      body,
      variables: extractVariables(body),
      updated_at: new Date().toISOString(),
    };
    if (id) {
      const { data, error } = await supabase.from("templates").update(row).eq("id", id).select("id");
      if (error) throw new Error(error.message);
      if (!data?.length) return "That template no longer exists — nothing was saved.";
      return `✅ Template “${tName}” updated.`;
    }
    const { error } = await supabase.from("templates").insert({ ...row, owner_id: userId });
    if (error) throw new Error(error.message);
    return `✅ Template “${tName}” created.`;
  }
  if (name === "delete_template") {
    const id = typeof args.id === "string" && UUID_RE.test(args.id) ? args.id : null;
    if (!id) return "No template given — nothing was deleted.";
    const { data: tpl, error: tplErr } = await supabase
      .from("templates")
      .select("body")
      .eq("id", id)
      .maybeSingle();
    if (tplErr) throw new Error(tplErr.message);
    if (!tpl) return "That template no longer exists.";
    const tBody = String((tpl as { body: string }).body ?? "");
    // Freeze the wording into anything that renders this template at fire
    // time — otherwise those sends would go out BLANK after the delete.
    const { data: snapped, error: snapErr } = await supabase
      .from("scheduled_sends")
      .update({ body: tBody })
      .eq("template_id", id)
      .is("body", null)
      .in("status", ["active", "paused"])
      .select("id");
    if (snapErr) throw new Error(snapErr.message);
    // Sequence steps keep template_id inside jsonb (no FK) — inline the body.
    const { data: seqs, error: seqErr } = await supabase.from("sequences").select("id,steps");
    if (seqErr) throw new Error(seqErr.message);
    let seqTouched = 0;
    type Step = { template_id?: string | null; body?: string | null; [k: string]: unknown };
    for (const s of (seqs ?? []) as { id: string; steps: Step[] }[]) {
      if (!Array.isArray(s.steps) || !s.steps.some((st) => st?.template_id === id)) continue;
      const steps = s.steps.map((st) =>
        st?.template_id === id ? { ...st, template_id: null, body: st.body ?? tBody } : st,
      );
      const { error } = await supabase.from("sequences").update({ steps }).eq("id", s.id);
      if (error) throw new Error(error.message);
      seqTouched++;
    }
    const { data, error } = await supabase.from("templates").delete().eq("id", id).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return "That template no longer exists.";
    const frozen = (snapped?.length ?? 0) + seqTouched;
    return `✅ Template deleted.${frozen > 0 ? ` ${snapped?.length ?? 0} scheduled send${(snapped?.length ?? 0) === 1 ? "" : "s"} and ${seqTouched} sequence${seqTouched === 1 ? "" : "s"} keep its old wording.` : ""}`;
  }
  if (name === "create_contacts") {
    const { rows, badPhone, dupes, dropped } = buildNewContacts(args);
    if (rows.length === 0) return "None of those had a valid phone number — nothing was added.";
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200).map((c) => ({
        owner_id: userId,
        name: c.name,
        phone: c.phone,
        email: c.email || null,
        company: c.company || null,
        notes: c.notes,
        tags: c.tags,
        chat_guid: chatGuidForPhone(c.phone),
      }));
      const { data, error } = await supabase
        .from("contacts")
        .upsert(batch, { onConflict: "owner_id,phone", ignoreDuplicates: true })
        .select("id");
      if (error) throw new Error(error.message);
      inserted += data?.length ?? 0;
    }
    const already = rows.length - inserted;
    return `✅ Added ${inserted} contact${inserted === 1 ? "" : "s"}${already > 0 ? ` (${already} already in your list)` : ""}${badPhone > 0 ? ` · ${badPhone} skipped, no valid phone` : ""}${dupes > 0 ? ` · ${dupes} duplicate rows` : ""}${dropped > 0 ? ` · ${dropped} more didn't fit — add the rest in another call` : ""}.`;
  }
  if (name === "update_settings") {
    const { patch, lines } = buildSettingsPatch(args, await storedWindow(supabase));
    if (Object.keys(patch).length === 0) return "Nothing valid to change — settings untouched.";
    const { error } = await supabase
      .from("app_settings")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) throw new Error(error.message);
    return `✅ Settings updated: ${lines.join(" · ")}.`;
  }
  if (name === "set_paused") {
    await supabase.from("app_settings").update({ paused: !!args.paused, updated_at: new Date().toISOString() }).eq("id", true);
    return args.paused ? "✅ Sending paused." : "✅ Sending resumed.";
  }
  return "Done.";
}
