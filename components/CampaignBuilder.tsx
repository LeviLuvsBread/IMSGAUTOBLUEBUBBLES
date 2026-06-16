"use client";

import { useMemo, useState } from "react";
import { createCampaign } from "@/app/(app)/actions";
import { estimateDrain } from "@/lib/throttle";
import type { AppSettings, Contact, Template } from "@/lib/types";

export function CampaignBuilder({
  contacts,
  templates,
  settings,
}: {
  contacts: Contact[];
  templates: Template[];
  settings: Pick<
    AppSettings,
    "min_delay_seconds" | "jitter_seconds" | "daily_cap"
  >;
}) {
  const [templateId, setTemplateId] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [company, setCompany] = useState("");
  const [all, setAll] = useState(false);

  const matched = useMemo(() => {
    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const noFilter = !all && !company && tagList.length === 0;
    if (noFilter) return [];
    return contacts.filter((c) => {
      if (c.opted_out) return false;
      if (all) return true;
      if (company && c.company !== company) return false;
      if (tagList.length && !tagList.every((t) => c.tags.includes(t)))
        return false;
      return true;
    });
  }, [contacts, tags, company, all]);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (t) setBody(t.body);
  }

  return (
    <form action={createCampaign} className="space-y-4">
      <input type="hidden" name="template_id" value={templateId} />
      <input type="hidden" name="body" value={body} />
      <input type="hidden" name="seg_tags" value={tags} />
      <input type="hidden" name="seg_company" value={company} />
      {all ? <input type="hidden" name="seg_all" value="on" /> : null}

      <div>
        <label className="mb-1 block text-sm font-medium">Campaign name</label>
        <input
          name="name"
          required
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Template</label>
        <select
          value={templateId}
          onChange={(e) => applyTemplate(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        >
          <option value="">None (write below)</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          Message{" "}
          <span className="text-xs font-normal text-neutral-400">
            (variables render per contact)
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

      <fieldset className="space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
        <legend className="px-1 text-sm font-medium">Audience</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => setAll(e.target.checked)}
          />
          All contacts
        </label>
        {!all ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              placeholder="Tags (comma-separated)"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
            />
            <input
              placeholder="Company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
            />
          </div>
        ) : null}
      </fieldset>

      <div className="rounded-lg bg-neutral-100 p-3 text-sm dark:bg-neutral-800">
        Matched <strong>{matched.length}</strong> contacts ·{" "}
        {estimateDrain(matched.length, settings)}
      </div>

      <button
        type="submit"
        disabled={matched.length === 0}
        className="rounded-lg bg-imsg-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Create &amp; start
      </button>
    </form>
  );
}
