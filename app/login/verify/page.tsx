import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthShell } from "@/components/AuthShell";
import { MfaChallenge } from "@/components/MfaChallenge";

export const dynamic = "force-dynamic";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Already fully verified, or no MFA on this account — nothing to do here.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!aal || aal.currentLevel === "aal2" || aal.nextLevel !== "aal2") {
    redirect(sp.redirect ?? "/");
  }

  return (
    <AuthShell>
      <MfaChallenge redirectTo={sp.redirect ?? "/"} />
    </AuthShell>
  );
}
