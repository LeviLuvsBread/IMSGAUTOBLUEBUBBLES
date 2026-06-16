import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client. BYPASSES RLS. Use ONLY in server code that has no user
// session: the BlueBubbles webhook and the cron pump. NEVER import this into a
// Client Component. When inserting owned rows here, always set owner_id =
// APP_OWNER_ID so they remain visible to you via RLS.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

// The single app user's auth.users UUID (set in env). Stamped on rows created
// by the webhook/cron so RLS lets the logged-in user read them.
export function appOwnerId(): string {
  const id = process.env.APP_OWNER_ID;
  if (!id) throw new Error("APP_OWNER_ID env var is not set");
  return id;
}
