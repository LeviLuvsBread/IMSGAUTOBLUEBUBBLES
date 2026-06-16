import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];

// Lightweight, Edge-safe auth gate.
//
// We intentionally do NOT import the Supabase client here. It transitively
// references `process.version` (supabase-js constants), which the Edge Runtime
// forbids (Vercel fails the build) AND which crashes Vercel's Node.js middleware
// runtime at invocation (MIDDLEWARE_INVOCATION_FAILED). So middleware only checks
// for the presence of a Supabase auth cookie and redirects logged-out visitors
// to /login. The REAL token validation (revalidate + redirect) happens server-
// side in app/(app)/layout.tsx and the login page via supabase.auth.getUser(),
// and every server action already self-guards via requireUser().
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));

  if (!hasAuthCookie && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Run on everything EXCEPT static assets, PWA files, and the machine endpoints
// (BlueBubbles webhook + Vercel cron), which authenticate themselves.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|apple-icon|api/webhook|api/cron).*)",
  ],
};
