"use client";

import { useState, useTransition } from "react";
import { Sparkles, Check, X, Pencil, Loader2 } from "lucide-react";
import { approveDraft, editDraft, discardDraft } from "@/app/(app)/actions";
import type { Message } from "@/lib/types";

// A held AI draft (queued, ai_pending_approval). The owner approves, edits, or
// discards it. On approve the pump sends it; realtime then re-renders it as a
// normal sent bubble.
export function AiDraftCard({ message }: { message: Message }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(message.body);
  const [gone, setGone] = useState(false);
  const [pending, start] = useTransition();

  if (gone) return null;

  const approve = () =>
    start(async () => {
      if (editing && text.trim() && text.trim() !== message.body) {
        await editDraft(message.id, text);
      }
      await approveDraft(message.id);
      setEditing(false);
    });

  const discard = () =>
    start(async () => {
      await discardDraft(message.id);
      setGone(true);
    });

  const saveEdit = () =>
    start(async () => {
      await editDraft(message.id, text);
      setEditing(false);
    });

  const btn =
    "press inline-flex items-center gap-1 rounded-control px-2.5 py-1.5 text-footnote font-medium transition-colors duration-fast ease-ios disabled:opacity-50";

  return (
    <div className="mt-2 flex justify-end">
      <div className="w-full max-w-[85%] rounded-[18px] border border-accent/30 bg-accent/[0.06] p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-caption2 font-semibold uppercase tracking-wide text-accent">
          <Sparkles className="h-3 w-3" /> AI draft · waiting for you
        </div>

        {editing ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            autoFocus
            className="w-full resize-y rounded-control bg-surface px-3 py-2 text-callout outline-none ring-1 ring-black/10 focus:ring-2 focus:ring-accent dark:ring-white/15"
          />
        ) : (
          <p className="whitespace-pre-wrap break-words text-callout text-label">
            {text}
          </p>
        )}

        <div className="mt-2.5 flex items-center justify-end gap-2">
          {editing ? (
            <button
              onClick={saveEdit}
              disabled={pending}
              className={`${btn} text-label-secondary hover:bg-fill-tertiary`}
            >
              Save
            </button>
          ) : (
            <button
              onClick={() => setEditing(true)}
              disabled={pending}
              className={`${btn} text-label-secondary hover:bg-fill-tertiary`}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          )}
          <button
            onClick={discard}
            disabled={pending}
            className={`${btn} text-danger hover:bg-danger/10`}
          >
            <X className="h-3.5 w-3.5" /> Discard
          </button>
          <button
            onClick={approve}
            disabled={pending}
            className={`${btn} bg-accent text-white hover:opacity-90`}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Approve &amp; send
          </button>
        </div>
      </div>
    </div>
  );
}
