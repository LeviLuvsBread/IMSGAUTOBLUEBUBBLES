import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthShell } from "@/components/AuthShell";
import { authInputCls, authButtonCls } from "@/lib/auth-ui";
import { signIn } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirect?: string; reset?: string }>;
}) {
  const sp = await searchParams;

  // Already signed in? Skip the form.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(sp.redirect ?? "/");

  return (
    <AuthShell>
      <h2 className="text-callout font-semibold">Sign in</h2>

      {sp.reset ? (
        <div className="mt-3 rounded-control bg-success/10 px-3 py-2 text-footnote text-label">
          Password updated — sign in with your new password.
        </div>
      ) : null}
      {sp.error ? (
        <div className="mt-3 rounded-control bg-danger/10 px-3 py-2 text-footnote text-danger">
          {sp.error}
        </div>
      ) : null}

      <form action={signIn} className="mt-4 space-y-3">
        <input type="hidden" name="redirect" value={sp.redirect ?? "/"} />
        <div>
          <label htmlFor="email" className="sr-only">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="username"
            placeholder="Email"
            className={authInputCls}
          />
        </div>
        <div>
          <label htmlFor="password" className="sr-only">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Password"
            className={authInputCls}
          />
        </div>
        <button className={authButtonCls}>Sign in</button>
      </form>

      <Link
        href="/forgot"
        className="mt-4 block text-center text-footnote text-accent hover:underline"
      >
        Forgot your password?
      </Link>
    </AuthShell>
  );
}
