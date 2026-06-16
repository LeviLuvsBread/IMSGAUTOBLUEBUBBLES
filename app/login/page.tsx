import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signIn } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirect?: string }>;
}) {
  const sp = await searchParams;

  // Already signed in? Skip the form. (Middleware no longer redirects away from
  // /login on cookie presence, to avoid a redirect loop with stale cookies.)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(sp.redirect ?? "/");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-6 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-10 w-10" />
          <div>
            <h1 className="text-lg font-semibold">iMessage Outreach</h1>
            <p className="text-sm text-neutral-500">Private dashboard — sign in</p>
          </div>
        </div>

        {sp.error ? (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {sp.error}
          </p>
        ) : null}

        <form action={signIn} className="space-y-3">
          <input type="hidden" name="redirect" value={sp.redirect ?? "/"} />
          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <input
              name="email"
              type="email"
              required
              autoComplete="username"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-imsg-blue dark:border-neutral-700 dark:bg-neutral-800"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Password</label>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-imsg-blue dark:border-neutral-700 dark:bg-neutral-800"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-imsg-blue px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
