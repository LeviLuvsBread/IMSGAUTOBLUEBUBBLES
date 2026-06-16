import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ContactForm } from "@/components/ContactForm";
import type { Contact } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EditContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/contacts" className="text-sm text-imsg-blue hover:underline">
        ← Contacts
      </Link>
      <h1 className="text-lg font-semibold">Edit {(data as Contact).name}</h1>
      <ContactForm contact={data as Contact} />
    </div>
  );
}
