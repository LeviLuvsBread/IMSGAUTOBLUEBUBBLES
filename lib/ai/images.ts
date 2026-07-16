import "server-only";
import { resolveBbUrl } from "@/lib/provider";
import type { MessageAttachment } from "@/lib/types";

const MAX_IMAGES = 3; // enough context without blowing up the request
const MAX_BYTES = 4_000_000; // skip anything bigger than ~4MB

// Fetch a message's image attachments from the BlueBubbles server as base64
// data URLs, ready to pass to a vision model. Anything that fails, times out,
// or is oversized is silently skipped — vision is best-effort, never blocking.
export async function fetchInboundImages(
  atts: MessageAttachment[] | null | undefined,
): Promise<string[]> {
  const images = (atts ?? [])
    .filter((a) => a.guid && (a.mime ?? "").startsWith("image/"))
    .slice(0, MAX_IMAGES);
  if (images.length === 0) return [];

  const base = (await resolveBbUrl()).replace(/\/+$/, "");
  if (!base) return [];

  const out: string[] = [];
  for (const a of images) {
    try {
      if (a.size && a.size > MAX_BYTES) continue;
      const u = new URL(
        `${base}/api/v1/attachment/${encodeURIComponent(a.guid!)}/download`,
      );
      u.searchParams.set("password", process.env.BB_PASSWORD ?? "");
      const res = await fetch(u, {
        headers: { "ngrok-skip-browser-warning": "true" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) continue;
      const mime = a.mime || res.headers.get("content-type") || "image/jpeg";
      out.push(`data:${mime};base64,${Buffer.from(buf).toString("base64")}`);
    } catch {
      /* skip this image */
    }
  }
  return out;
}
