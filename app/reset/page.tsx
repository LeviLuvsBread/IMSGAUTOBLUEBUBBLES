import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthShell } from "@/components/AuthShell";
import { authInputCls, authButtonCls } from "@/lib/auth-ui";
import { updatePassword } from "./actions";

export const dynamic = "force-dynamic";

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Reachable only with a valid (recovery or signed-in) session.
  if (!user) redirect("/forgot");

  return (
    <AuthShell>
      <h2 className="text-callout font-semibold">Set a new password</h2>
      <p className="mt-1 text-footnote text-label-secondary">{user.email}</p>

      {sp.error ? (
        <div className="mt-3 rounded-control bg-danger/10 px-3 py-2 text-footnote text-danger">
          {sp.error}
        </div>
      ) : null}

      <form action={updatePassword} className="mt-4 space-y-3">
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="New password"
          className={authInputCls}
        />
        <input
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Confirm new password"
          className={authInputCls}
        />
        <button className={authButtonCls}>Update password</button>
      </form>
    </AuthShell>
  );
}
