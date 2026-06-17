"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://imsgauto.com";

  if (email) {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/auth/callback?next=/reset`,
    });
  }

  // Always report success — never reveal whether an account exists for an email.
  redirect("/forgot?sent=1");
}
