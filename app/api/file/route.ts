import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { UPLOAD_BUCKET } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Streams a file from the private uploads bucket (outbound attachments in the
// thread view). Auth-guarded; ?download=1&name= forces save-as.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const q = new URL(request.url).searchParams;
  const path = q.get("path") ?? "";
  // Paths are namespaced by user id on upload — no traversal, no other users.
  if (!path || path.includes("..")) return new Response("bad path", { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(UPLOAD_BUCKET).download(path);
  if (error || !data) return new Response("not found", { status: 404 });

  const headers = new Headers();
  headers.set("content-type", data.type || "application/octet-stream");
  headers.set("cache-control", "private, max-age=86400");
  if (q.get("download")) {
    const name = (q.get("name") || path.split("/").pop() || "file").replace(/["\r\n]/g, "");
    headers.set("content-disposition", `attachment; filename="${name}"`);
  }
  return new Response(data.stream(), { status: 200, headers });
}
