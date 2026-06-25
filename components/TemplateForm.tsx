"use client";

import { useRef, useState } from "react";
import { Shuffle } from "lucide-react";
import { saveTemplate } from "@/app/(app)/actions";
import { renderForContact, countVariations } from "@/lib/templating";
import { MergeFields } from "@/components/MergeFields";
import type { Template } from "@/lib/types";

// Example person used for the live preview, so users see how it'll read.
const SAMPLE = {
  name: "Sarah Lee",
  company: "Acme Co",
  email: "sarah@acme.co",
  phone: "+13055551234",
};

export function TemplateForm({ template }: { template?: Template }) {
  const [name, setName] = useState(template?.name ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const insert = (v: string) => {
    const ta = taRef.current;
    if (!ta) {
      setBody((b) => b + v);
      return;
    }
    const s = ta.selectionStart ?? body.length;
    const e = ta.selectionEnd ?? body.length;
    setBody(body.slice(0, s) + v + body.slice(e));
    requestAnimationFrame(() => {
      ta.focus();
      const p = s + v.length;
      ta.setSelectionRange(p, p);
    });
  };

  // Deterministic preview (always the first option of each {a|b} group) so it
  // stays stable while typing; the actual sends pick randomly per recipient.
  const preview = renderForContact(body, SAMPLE, { rand: () => 0 });
  const variations = countVariations(body);
  const inputCls =
    "w-full rounded-control bg-fill px-3 py-2 text-subhead outline-none transition-colors duration-fast ease-ios placeholder:text-label-secondary focus:bg-fill-secondary";

  return (
    <form action={saveTemplate} className="space-y-3">
      {template ? <input type="hidden" name="id" value={template.id} /> : null}

      <div>
        <label htmlFor="tname" className="mb-1 block text-footnote font-medium text-label-secondary">
          Name
        </label>
        <input
          id="tname"
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Warm intro"
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="tbody" className="mb-1 block text-footnote font-medium text-label-secondary">
          Message
        </label>
        <p className="mb-2 text-caption text-label-secondary">
          Tap to drop in a detail that auto-fills for each person:
        </p>
        <MergeFields onInsert={insert} />
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => insert("{option one|option two}")}
            title="Each person randomly gets one of the options, so the same template doesn't send identical text to everyone"
            className="press inline-flex items-center gap-1 rounded-full bg-fill px-2.5 py-1 text-caption font-medium text-label-secondary ring-1 ring-hairline transition-colors duration-fast ease-ios hover:bg-accent/10 hover:text-accent"
          >
            <Shuffle className="h-3 w-3" /> Add wording variation
          </button>
          <span className="text-caption text-label-secondary">
            {"{like this|or this}"} — one is picked at random per person
          </span>
        </div>
        <textarea
          id="tbody"
          ref={taRef}
          name="body"
          required
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Hey {{first_name}}, it's Ben from Blackbridge…"
          className={`${inputCls} mt-2 resize-y`}
        />
        <div className="mt-1 text-caption text-label-secondary tabular-nums">
          {body.length} characters
        </div>
      </div>

      {body.trim() ? (
        <div className="rounded-control bg-fill p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-caption2 font-medium uppercase tracking-wide text-label-secondary">
              Preview — example: Sarah at Acme Co
            </span>
            {variations > 1 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-caption2 font-medium text-accent">
                <Shuffle className="h-3 w-3" />
                {variations >= 100 ? "100+" : variations} variations
              </span>
            ) : null}
          </div>
          <div className="whitespace-pre-wrap text-callout">{preview}</div>
        </div>
      ) : null}

      <button className="press rounded-control bg-accent px-4 py-2 text-subhead font-semibold text-white">
        {template ? "Save changes" : "Create template"}
      </button>
    </form>
  );
}
