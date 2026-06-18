import "server-only";

// Deterministic guardrails that run WITHOUT a model — fail-safe defaults.

// TCPA opt-out: if the inbound matches, we must stop and never reply.
const OPT_OUT_RE =
  /\b(stop|stopall|unsubscribe|cancel|quit|end|opt[\s-]?out|remove me|don'?t (text|contact|message) me|leave me alone)\b/i;

export function isOptOut(text: string): boolean {
  return OPT_OUT_RE.test((text ?? "").trim());
}

// Post-draft safety net: catch a model that slipped a rate / approval / amount
// into the reply despite the compliance stage. Trips → escalate, never send.
const RISKY_RE =
  /(\d+(\.\d+)?\s*%|\bAPR\b|\bfactor rate\b|\bguarantee|\bapproved for\b|\byou (qualify|are approved|qualify for)\b|\$\s?\d[\d,]*)/i;

export function looksRisky(text: string): boolean {
  return RISKY_RE.test(text ?? "");
}
