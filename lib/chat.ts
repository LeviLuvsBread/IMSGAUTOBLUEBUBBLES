// Phone-number normalization and BlueBubbles chat GUID helpers.

const SERVICE = "iMessage";

// Best-effort E.164 normalization. Defaults to US (+1) when no country code is
// present. For a single-user partner-outreach tool this is sufficient; pass
// numbers already in +CC… form to skip the heuristic.
export function toE164(input: string, defaultCountry = "1"): string {
  const trimmed = (input ?? "").trim();
  if (trimmed.startsWith("+")) {
    return "+" + trimmed.slice(1).replace(/\D/g, "");
  }
  const d = trimmed.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  if (d.length === 10) return `+${defaultCountry}${d}`;
  return `+${d}`;
}

export function isLikelyE164(value: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(value);
}

// "iMessage;-;+14155551234"
export function chatGuidForPhone(phoneE164: string, service = SERVICE): string {
  return `${service};-;${phoneE164}`;
}

// "iMessage;-;+14155551234" → "+14155551234"
export function addressFromChatGuid(guid: string): string {
  const parts = (guid ?? "").split(";-;");
  return parts[parts.length - 1] ?? guid;
}
