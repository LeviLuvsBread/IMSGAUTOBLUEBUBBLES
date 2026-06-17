import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles the PKCE redirect from Supabase auth emails (password recovery).
// Exchanges the one-time code for a session cookie, then forwards to `next`.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/";
  const next = nextParam.startsWith("/") ? nextParam : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent(
      "That link is invalid or has expired — request a new one.",
    )}`,
  );
}
