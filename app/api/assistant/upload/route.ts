import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { UPLOAD_BUCKET } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;

// Stores a file the owner attached in the Director chat. Returns the storage
// path + metadata the agent's tools (send_file, import_contacts) work with.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "bad form" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file" }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file too large (25MB max)" }, { status: 413 });
  }

  const safeName = (file.name || "upload").replace(/[^\w.\- ()]/g, "_").slice(0, 120);
  const path = `${user.id}/${Date.now()}-${safeName}`;
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(UPLOAD_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (error) {
    console.error("[assistant/upload]", error);
    return NextResponse.json({ error: "upload failed" }, { status: 500 });
  }
  return NextResponse.json({
    path,
    name: file.name || safeName,
    mime: file.type || "application/octet-stream",
    size: file.size,
  });
}
