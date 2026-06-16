// BlueBubbles does not sign webhook payloads, so we gate the route with our own
// shared secret — accepted either as ?secret=… (or ?password=…) on the URL, or
// an x-webhook-secret header. Append it to the URL you paste into BlueBubbles.
export function verifyWebhookSecret(request: Request): boolean {
  const expected = process.env.WEBHOOK_SECRET;
  if (!expected) return false; // fail closed if not configured
  const url = new URL(request.url);
  const fromQuery =
    url.searchParams.get("secret") ?? url.searchParams.get("password");
  const fromHeader = request.headers.get("x-webhook-secret");
  return fromQuery === expected || fromHeader === expected;
}

// Cron/pump auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
// An external pinger (launchd / cron-job.org) may use `Bearer ${PUMP_SECRET}`.
export function verifyCronAuth(request: Request): boolean {
  const auth = request.headers.get("authorization") ?? "";
  const url = new URL(request.url);
  const queryKey = url.searchParams.get("key");
  const secrets = [process.env.CRON_SECRET, process.env.PUMP_SECRET].filter(
    Boolean,
  ) as string[];
  if (secrets.length === 0) return false;
  return secrets.some(
    (s) => auth === `Bearer ${s}` || queryKey === s,
  );
}
