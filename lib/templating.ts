// Mustache-style {{variable}} templating with contact-derived variables.
import type { Contact } from "./types";

const VAR_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

export function extractVariables(body: string): string[] {
  const set = new Set<string>();
  for (const m of (body ?? "").matchAll(VAR_RE)) set.add(m[1]);
  return [...set];
}

export function renderTemplate(
  body: string,
  vars: Record<string, unknown>,
): string {
  return (body ?? "").replace(VAR_RE, (_full, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

// Standard variables available in every template, derived from a contact.
export function contactVars(c: Partial<Contact>): Record<string, string> {
  const name = (c.name ?? "").trim();
  const first = name.split(/\s+/)[0] ?? "";
  return {
    name,
    first_name: first,
    firstName: first,
    company: c.company ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
  };
}

export function renderForContact(body: string, c: Partial<Contact>): string {
  return renderTemplate(body, contactVars(c));
}
