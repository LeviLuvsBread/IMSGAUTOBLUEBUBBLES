"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    redirect("/reset?error=" + encodeURIComponent("Use at least 8 characters."));
  }
  if (password !== confirm) {
    redirect("/reset?error=" + encodeURIComponent("Passwords don't match."));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/forgot");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect("/reset?error=" + encodeURIComponent(error.message));
  }

  // Sign out so the new password is used on the next sign-in (clean recovery).
  await supabase.auth.signOut();
  redirect("/login?reset=1");
}
