import "server-only";

// Deterministic guardrails that run WITHOUT a model — fail-safe defaults.

// TCPA opt-out: if the inbound matches, we must stop and never reply.
// Covers the standard carrier keywords PLUS natural "stop / leave me alone /
// take me off / wrong number" phrasing AND abuse directed at the sender
// ("fuck you", "eat shit"…) — a hostile contact is not a lead, there is
// nothing to hand over, so it's treated exactly like STOP. Deliberately
// broad — a false positive only costs us one lead, and the owner wants
// STOP to truly stop.
const OPT_OUT_RE =
  /\b(stop|stopall|unsubscribe|cancel|quit|end|opt[\s-]?out|remove me|(take|get) me off|delete my (number|info|details)|lose my number|wrong number|(don'?t|do not|never) (ever )?(text|contact|message|call) (me|us|this number)( again)?|leave me alone|fuck (you|u|off)|fck (you|u|off)|f (off|u)|stfu|screw (you|off)|eat shit|go to hell|kiss my ass|get lost|piss off|go away)\b/i;

export function isOptOut(text: string): boolean {
  return OPT_OUT_RE.test((text ?? "").trim());
}

// Safety net for the AI-written OPENER: catch a model that slipped a rate /
// approval / amount into the text despite the rules. Trips → the opener is
// discarded and the spintax template sends instead.
const RISKY_RE =
  /(\d+(\.\d+)?\s*%|\bAPR\b|\bfactor rate\b|\bguarantee|\bapproved for\b|\byou (qualify|are approved|qualify for)\b|\$\s?\d[\d,]*)/i;

export function looksRisky(text: string): boolean {
  return RISKY_RE.test(text ?? "");
}
