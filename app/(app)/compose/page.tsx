import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ComposeForm } from "@/components/ComposeForm";
import type { Contact, Template } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: contacts }, { data: templates }] = await Promise.all([
    supabase.from("contacts").select("*").eq("opted_out", false).order("name"),
    supabase.from("templates").select("*").order("name"),
  ]);

  return (
    <div className="max-w-xl">
      <h1 className="mb-3 text-lg font-semibold">Compose</h1>
      {sp.error ? (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {sp.error}
        </p>
      ) : null}
      {(contacts ?? []).length === 0 ? (
        <p className="text-sm text-neutral-400">
          Add a contact first on the{" "}
          <Link href="/contacts" className="text-imsg-blue hover:underline">
            Contacts
          </Link>{" "}
          page.
        </p>
      ) : (
        <ComposeForm
          contacts={(contacts ?? []) as Contact[]}
          templates={(templates ?? []) as Template[]}
        />
      )}
    </div>
  );
}
