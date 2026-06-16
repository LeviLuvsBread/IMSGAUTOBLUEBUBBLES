"use client";

import { useMemo, useState } from "react";
import { sendNow } from "@/app/(app)/actions";
import { renderForContact } from "@/lib/templating";
import type { Contact, Template } from "@/lib/types";

export function ComposeForm({
  contacts,
  templates,
}: {
  contacts: Contact[];
  templates: Template[];
}) {
  const [contactId, setContactId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [body, setBody] = useState("");

  const contact = useMemo(
    () => contacts.find((c) => c.id === contactId),
    [contacts, contactId],
  );

  const preview = useMemo(
    () => (contact ? renderForContact(body, contact) : body),
    [body, contact],
  );

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (t) setBody(t.body);
  }

  return (
    <form action={sendNow} className="space-y-4">
      <input type="hidden" name="contact_id" value={contactId} />
      {/* The rendered text is what actually gets sent. */}
      <input type="hidden" name="body" value={preview} />

      <div>
        <label className="mb-1 block text-sm font-medium">Recipient</label>
        <select
          value={contactId}
          onChange={(e) => setContactId(e.target.value)}
          required
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        >
          <option value="">Select a contact…</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.phone})
              {c.company ? ` · ${c.company}` : ""}
            </option>
          ))}
        </select>
      </div>

      {templates.length > 0 ? (
        <div>
          <label className="mb-1 block text-sm font-medium">
            Template (optional)
          </label>
          <select
            value={templateId}
            onChange={(e) => applyTemplate(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          >
            <option value="">None</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div>
        <label className="mb-1 block text-sm font-medium">
          Message{" "}
          <span className="text-xs font-normal text-neutral-400">
            (use {"{{name}}"}, {"{{first_name}}"}, {"{{company}}"})
          </span>
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          required
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
      </div>

      {contact ? (
        <div className="rounded-lg bg-neutral-100 p-3 text-sm dark:bg-neutral-800">
          <div className="mb-1 text-xs font-medium text-neutral-500">
            Preview to {contact.name}
          </div>
          <div className="whitespace-pre-wrap">{preview || "—"}</div>
        </div>
      ) : null}

      <button
        type="submit"
        className="rounded-lg bg-imsg-blue px-4 py-2 text-sm font-medium text-white"
      >
        Send now
      </button>
    </form>
  );
}
