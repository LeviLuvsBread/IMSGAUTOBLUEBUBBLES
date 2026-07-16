import { createClient } from "@/lib/supabase/server";
import { resolveBbUrl } from "@/lib/provider";

export const dynamic = "force-dynamic";
// Large videos can take a while to stream through.
export const maxDuration = 60;

// Streams an attachment's bytes from the BlueBubbles server. The BB URL +
// password never reach the browser — this route authenticates the dashboard
// session, then proxies. `?download=1&name=<file>` forces a save-as download;
// otherwise the file renders inline (images/video in the thread).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ guid: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const { guid } = await params;
  if (!guid) return new Response("missing guid", { status: 400 });

  const base = (await resolveBbUrl()).replace(/\/+$/, "");
  if (!base) return new Response("bridge not configured", { status: 503 });

  const upstream = new URL(
    `${base}/api/v1/attachment/${encodeURIComponent(guid)}/download`,
  );
  upstream.searchParams.set("password", process.env.BB_PASSWORD ?? "");

  let res: Response;
  try {
    res = await fetch(upstream, {
      headers: { "ngrok-skip-browser-warning": "true" },
      signal: AbortSignal.timeout(55_000),
    });
  } catch {
    return new Response("bridge unreachable", { status: 502 });
  }
  if (!res.ok || !res.body) {
    return new Response("attachment not found", { status: 404 });
  }

  const q = new URL(request.url).searchParams;
  const headers = new Headers();
  headers.set(
    "content-type",
    res.headers.get("content-type") ?? "application/octet-stream",
  );
  const len = res.headers.get("content-length");
  if (len) headers.set("content-length", len);
  // Attachment bytes are immutable per guid — let the browser cache them.
  headers.set("cache-control", "private, max-age=86400");
  if (q.get("download")) {
    const name = (q.get("name") || "attachment").replace(/["\r\n]/g, "");
    headers.set("content-disposition", `attachment; filename="${name}"`);
  }
  return new Response(res.body, { status: 200, headers });
}
