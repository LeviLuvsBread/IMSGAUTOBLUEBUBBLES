"use client";

import { useState } from "react";
import { createScheduledSend } from "@/app/(app)/actions";
import type { Contact, Template } from "@/lib/types";

export function ScheduleForm({
  contacts,
  templates,
}: {
  contacts: Contact[];
  templates: Template[];
}) {
  const [useSegment, setUseSegment] = useState(false);

  return (
    <form action={createScheduledSend} className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="use_segment"
          checked={useSegment}
          onChange={(e) => setUseSegment(e.target.checked)}
        />
        Send to a segment (instead of one contact)
      </label>

      {useSegment ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            name="seg_tags"
            placeholder="Tags (comma-separated)"
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
          <input
            name="seg_company"
            placeholder="Company"
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="seg_all" /> All contacts
          </label>
        </div>
      ) : (
        <div>
          <label className="mb-1 block text-sm font-medium">Contact</label>
          <select
            name="contact_id"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          >
            <option value="">Select…</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.phone})
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium">
          Template (optional)
        </label>
        <select
          name="template_id"
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

      <div>
        <label className="mb-1 block text-sm font-medium">
          Message (leave blank to use template)
        </label>
        <textarea
          name="body"
          rows={3}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Send at</label>
          <input
            type="datetime-local"
            name="run_at"
            required
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Repeat</label>
          <select
            name="recurrence"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          >
            <option value="">Once</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Repeating sends have duplicate protection: each run only texts people
        this schedule hasn&apos;t messaged yet (plus anyone new in the list), then
        picks up where it left off next time — no manual resume needed.
      </p>

      <button className="rounded-lg bg-imsg-blue px-4 py-2 text-sm font-medium text-white">
        Schedule
      </button>
    </form>
  );
}
