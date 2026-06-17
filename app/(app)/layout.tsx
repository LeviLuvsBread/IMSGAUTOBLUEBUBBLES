import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { signOut } from "./actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Real auth enforcement (middleware was removed; the edge can't run our
  // Supabase client). Revalidate the session here and bounce to /login.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Enforce 2FA: if a factor is enrolled but the session is still aal1, the
  // user must complete the authenticator challenge before reaching the app.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2") {
    redirect("/login/verify");
  }

  return <AppShell signOut={signOut}>{children}</AppShell>;
}
