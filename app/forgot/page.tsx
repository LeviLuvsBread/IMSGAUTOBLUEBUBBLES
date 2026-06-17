import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { authInputCls, authButtonCls } from "@/lib/auth-ui";
import { requestPasswordReset } from "./actions";

export const dynamic = "force-dynamic";

export default async function ForgotPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const sp = await searchParams;

  return (
    <AuthShell>
      <h2 className="text-callout font-semibold">Reset your password</h2>

      {sp.sent ? (
        <>
          <div className="mt-4 rounded-control bg-success/10 px-3 py-3 text-footnote text-label">
            If an account exists for that email, a reset link is on its way.
            Check your inbox (and spam). The link opens a page to set a new
            password.
          </div>
          <Link
            href="/login"
            className="mt-4 block text-center text-footnote text-accent hover:underline"
          >
            Back to sign in
          </Link>
        </>
      ) : (
        <>
          <p className="mt-1 text-footnote text-label-secondary">
            Enter your email and we&apos;ll send a link to set a new password.
          </p>
          <form action={requestPasswordReset} className="mt-4 space-y-3">
            <input
              name="email"
              type="email"
              required
              autoComplete="username"
              placeholder="you@example.com"
              className={authInputCls}
            />
            <button className={authButtonCls}>Send reset link</button>
          </form>
          <Link
            href="/login"
            className="mt-4 block text-center text-footnote text-accent hover:underline"
          >
            Back to sign in
          </Link>
        </>
      )}
    </AuthShell>
  );
}
