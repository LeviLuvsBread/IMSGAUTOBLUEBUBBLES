import { createClient } from "@/lib/supabase/server";
import { ContactForm } from "@/components/ContactForm";
import { ContactImport } from "@/components/ContactImport";
import { ContactExport } from "@/components/ContactExport";
import { ContactsList } from "@/components/ContactsList";
import { lastContactedMap } from "@/lib/last-contacted";
import type { Contact } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const supabase = await createClient();
  const [{ data }, lastContacted] = await Promise.all([
    supabase.from("contacts").select("*").order("name", { ascending: true }),
    lastContactedMap(supabase),
  ]);
  const contacts = (data ?? []) as Contact[];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-footnote text-label-secondary tabular-nums">
            {contacts.length} total
          </p>
          <h1 className="text-h4 font-display">Contacts</h1>
        </div>
        <div className="flex items-center gap-2">
          <ContactExport contacts={contacts} lastContacted={lastContacted} />
          <ContactImport />
        </div>
      </div>

      <details className="overflow-hidden rounded-card bg-surface shadow-card ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
        <summary className="cursor-pointer list-none px-4 py-3 text-subhead font-semibold">
          Add a contact manually
        </summary>
        <div className="border-t border-separator p-4">
          <ContactForm />
        </div>
      </details>

      <ContactsList contacts={contacts} lastContacted={lastContacted} />
    </div>
  );
}
