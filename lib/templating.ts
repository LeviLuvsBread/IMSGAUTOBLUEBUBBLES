// Mustache-style {{variable}} templating, plus optional {a|b|c} "spintax" so a
// single template renders a DIFFERENT wording for each recipient. Sending the
// exact same text to everyone in one burst is a classic spam signal — spintax
// lets one opener fan out into many variations automatically.
import type { Contact } from "./types";

// Variable names may contain letters/digits/._- and inner spaces, so hand-typed
// tags like {{First name}} or {{First_Name}} are recognized too (lookup is
// case/spacing-insensitive — see renderTemplate). "|" is excluded so a spintax
// group can never be mistaken for a variable.
const VAR_RE = /\{\{\s*([\w.-]+(?:[^\S\r\n]+[\w.-]+)*)\s*\}\}/g;

// "First Name" / "first_name" / "firstName" all normalize to "firstname".
const normalizeKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");
// A spintax group: single braces wrapping 2+ options separated by "|". An
// option may contain {{variables}} ("{Hey {{first_name}}|Hi {{first_name}}}")
// but no other braces. Requiring a pipe means {{variables}} are never mistaken
// for spintax (they have no "|" and use double braces), and options can be
// split on "|" safely since variable names can't contain it.
const SPINTAX_OPT = /(?:[^{}|]|\{\{[^{}]*\}\})*/.source;
const SPINTAX_RE = new RegExp(`\\{(${SPINTAX_OPT}(?:\\|${SPINTAX_OPT})+)\\}`, "g");

export type RenderOpts = {
  // Picks a number in [0, 1). Defaults to Math.random for true per-send
  // variation; pass a deterministic picker (e.g. () => 0) for stable previews.
  rand?: () => number;
};

export function extractVariables(body: string): string[] {
  const set = new Set<string>();
  for (const m of (body ?? "").matchAll(VAR_RE)) set.add(m[1]);
  return [...set];
}

// How many distinct messages a body can produce from its spintax groups
// (product of each group's option count). Capped so the UI shows "100+"
// instead of an unwieldy product. Returns 1 when there's no spintax.
export function countVariations(body: string): number {
  let n = 1;
  for (const m of (body ?? "").matchAll(SPINTAX_RE)) {
    n *= m[1].split("|").length;
    if (n >= 100) return 100;
  }
  return n;
}

// Collapse every {a|b|c} group down to one chosen option.
export function applySpintax(
  body: string,
  rand: () => number = Math.random,
): string {
  return (body ?? "").replace(SPINTAX_RE, (_full, inner: string) => {
    const opts = inner.split("|");
    const i = Math.min(opts.length - 1, Math.floor(rand() * opts.length));
    return opts[i] ?? "";
  });
}

export function renderTemplate(
  body: string,
  vars: Record<string, unknown>,
  opts?: RenderOpts,
): string {
  // Spintax first, so a chosen option's {{variables}} still get filled in.
  const spun = applySpintax(body, opts?.rand);
  const byNormKey = new Map<string, unknown>();
  for (const [k, v] of Object.entries(vars)) byNormKey.set(normalizeKey(k), v);
  return spun.replace(VAR_RE, (_full, key: string) => {
    const v = Object.hasOwn(vars, key)
      ? vars[key]
      : byNormKey.get(normalizeKey(key));
    return v === undefined || v === null ? "" : String(v);
  });
}

// Standard variables available in every template, derived from a contact.
export function contactVars(c: Partial<Contact>): Record<string, string> {
  const name = (c.name ?? "").trim();
  const parts = name.split(/\s+/);
  const first = parts[0] ?? "";
  return {
    name,
    first_name: first,
    firstName: first,
    last_name: parts.slice(1).join(" "),
    company: c.company ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
  };
}

export function renderForContact(
  body: string,
  c: Partial<Contact>,
  opts?: RenderOpts,
): string {
  return renderTemplate(body, contactVars(c), opts);
}
