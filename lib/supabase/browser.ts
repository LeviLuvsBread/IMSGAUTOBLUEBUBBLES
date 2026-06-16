import { createBrowserClient } from "@supabase/ssr";

// Browser-safe Supabase client (uses the public anon key). Safe in Client
// Components. Auth tokens are persisted via cookies managed by middleware.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
