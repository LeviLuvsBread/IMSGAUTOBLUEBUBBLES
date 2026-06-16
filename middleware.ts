import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = ["/login"];

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

// Run on everything EXCEPT static assets, PWA files, and the machine endpoints
// (BlueBubbles webhook + Vercel cron), which authenticate themselves.
//
// runtime: "nodejs" — the Supabase SSR client transitively references
// `process.version` (supabase-js constants), which the Edge Runtime forbids and
// Vercel rejects at build time. Running middleware on the Node.js runtime removes
// that constraint entirely, regardless of the installed supabase-js version.
export const config = {
  runtime: "nodejs",
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|apple-icon|api/webhook|api/cron).*)",
  ],
};
