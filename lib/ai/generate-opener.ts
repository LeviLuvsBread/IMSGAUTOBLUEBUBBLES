import "server-only";
import { callOpenRouter, type ChatMessage } from "./llm";
import { looksRisky } from "./guardrails";
import { applySpintax } from "@/lib/templating";

// Cheap + fast model — openers are short and we generate one per send.
const OUTREACH_MODEL = "google/gemini-2.5-flash";

// Compliance rules used when the owner hasn't set ai_knowledge. Identity/voice
// is intentionally NOT hard-coded here — it's inferred from the anchor
// templates below so the opener always sounds like the user's own openers
// (rather than the AI-responder persona, which may be a different character).
const DEFAULT_KNOWLEDGE =
  "Texting business owners about working capital / funding. NEVER quote rates, %, APR, factor rates, fees, terms, or approval amounts. NEVER guarantee approval. Keep it to 1-2 short sentences with one easy question. No em-dashes.";

export type OpenerContext = {
  knowledge?: string | null;
  anchors: string[]; // the user's existing opener templates (the style/content to match)
};

function cleanup(text: string): string {
  let t = (text ?? "").trim();
  // strip code fences / surrounding quotes the model sometimes adds
  t = t.replace(/^```[a-z]*\s*|\s*```$/gi, "").trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim();
  }
  t = t.replace(/\s*\n\s*/g, " ").trim(); // collapse stray newlines
  if (t.length > 320) t = t.slice(0, 320).trim();
  return t;
}

// Reject truncated / malformed output. We instruct the model to end with one
// question, so a valid opener contains "?" and ends on terminal punctuation —
// a mid-sentence cutoff (e.g. a thinking-token overrun) fails this and falls
// back to a template instead of texting half a sentence.
function isValidOpener(t: string): boolean {
  return t.length >= 20 && t.includes("?") && /[?.!]$/.test(t);
}

// Generate ONE short, unique cold-outreach opener for a contact, closely
// anchored to the user's existing opener templates so it never strays
// off-message. Returns null on any failure or guardrail trip — callers fall
// back to a (spintax-varied) template.
export async function generateOpener(
  contact: { name?: string | null; company?: string | null },
  ctx: OpenerContext,
): Promise<string | null> {
  // Collapse any {a|b} spintax in the anchors to concrete examples before
  // showing them to the model.
  const anchors = ctx.anchors
    .map((a) => applySpintax(a ?? "").trim())
    .filter(Boolean)
    .slice(0, 5);
  if (anchors.length === 0) return null;

  const firstName = (contact.name ?? "").trim().split(/\s+/)[0] ?? "";

  const system = [
    `# Your job\nWrite ONE cold-outreach opening text message. It must match the VOICE, sender identity, and content of the examples below — same message, same ask — just worded freshly so no two people receive identical text. Never copy an example verbatim.`,
    `# Rules\n${ctx.knowledge?.trim() || DEFAULT_KNOWLEDGE}`,
    `# Hard limits\n- One or two short sentences, SMS length (max ~280 chars).\n- End with exactly one easy question.\n- Plain text only: no surrounding quotes, no markdown, no spintax {a|b}, no {{merge}} fields, no emojis.\n- NEVER mention rates, %, APR, fees, dollar amounts, approvals, or guarantees.`,
  ].join("\n\n");

  const user = [
    "Examples of how we open (match this voice and content exactly):",
    ...anchors.map((a, i) => `${i + 1}. ${a}`),
    "",
    `Recipient: ${contact.name?.trim() || "(name unknown)"}${
      contact.company ? `, company: ${contact.company}` : ""
    }.`,
    firstName
      ? `You may address them as "${firstName}" only if the examples use a first name.`
      : "",
    "Write the single opener now — text only, nothing else.",
  ]
    .filter(Boolean)
    .join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  try {
    const { text } = await callOpenRouter(OUTREACH_MODEL, messages, {
      temperature: 0.85,
      // Generous budget: Gemini 2.5 spends "thinking" tokens that count here,
      // and a tight cap truncates the visible opener mid-sentence.
      maxTokens: 400,
    });
    const opener = cleanup(text);
    if (!isValidOpener(opener)) return null; // truncated / malformed → fall back
    if (looksRisky(opener)) return null; // safety: never send rate/amount language
    return opener;
  } catch {
    return null;
  }
}
