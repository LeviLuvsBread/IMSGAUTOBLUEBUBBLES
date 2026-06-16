import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/provider";

export const dynamic = "force-dynamic";

// Authenticated health probe used by the HealthBadge. Pings BlueBubbles.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const provider = await getProvider();
    const health = await provider.health();
    return NextResponse.json({ bluebubbles: health });
  } catch (e) {
    return NextResponse.json({
      bluebubbles: { ok: false, error: String(e) },
    });
  }
}
