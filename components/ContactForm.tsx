import { saveContact } from "@/app/(app)/actions";
import type { Contact } from "@/lib/types";

export function ContactForm({ contact }: { contact?: Contact }) {
  return (
    <form action={saveContact} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {contact ? <input type="hidden" name="id" value={contact.id} /> : null}
      <div>
        <label className="mb-1 block text-sm font-medium">Name</label>
        <input
          name="name"
          required
          defaultValue={contact?.name ?? ""}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Phone (E.164)</label>
        <input
          name="phone"
          required
          placeholder="+14155551234"
          defaultValue={contact?.phone ?? ""}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Email</label>
        <input
          name="email"
          type="email"
          defaultValue={contact?.email ?? ""}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Company</label>
        <input
          name="company"
          defaultValue={contact?.company ?? ""}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">
          Tags (comma-separated)
        </label>
        <input
          name="tags"
          defaultValue={(contact?.tags ?? []).join(", ")}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Notes</label>
        <input
          name="notes"
          defaultValue={contact?.notes ?? ""}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
      </div>
      <div className="sm:col-span-2">
        <button className="rounded-lg bg-imsg-blue px-4 py-2 text-sm font-medium text-white">
          {contact ? "Save changes" : "Add contact"}
        </button>
      </div>
    </form>
  );
}
