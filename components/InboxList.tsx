"use client";

import { useRef, useState, useTransition, type PointerEvent as RPointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Check, Ban, Loader2, ListChecks, X } from "lucide-react";
import { optOutThreads } from "@/app/(app)/actions";
import { OptOutButton } from "@/components/OptOutButton";
import { cn } from "@/lib/cn";

export type InboxConvo = {
  chatGuid: string;
  contactId: string | null;
  title: string;
  preview: string;
  fromMe: boolean;
  dateIso: string;
  optedOut: boolean;
};

function initials(s: string) {
  const m = (s || "").replace(/[^a-zA-Z0-9]/g, "");
  return (m.slice(0, 2) || "··").toUpperCase();
}

export function InboxList({ conversations }: { conversations: InboxConvo[] }) {
  const router = useRouter();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  // Drag-to-select sweep (mouse), same gesture as the Compose recipient list.
  const dragging = useRef(false);
  const dragMode = useRef<"add" | "remove">("add");
  const suppressClick = useRef(false);

  const apply = (guid: string, mode: "add" | "remove") =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (mode === "add") n.add(guid);
      else n.delete(guid);
      return n;
    });
  const toggle = (guid: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(guid)) n.delete(guid);
      else n.add(guid);
      return n;
    });

  const rowPointerDown = (e: RPointerEvent<HTMLDivElement>, guid: string) => {
    if (e.pointerType !== "mouse") return; // touch taps toggle via onClick
    e.preventDefault();
    const mode: "add" | "remove" = selected.has(guid) ? "remove" : "add";
    apply(guid, mode);
    dragMode.current = mode;
    dragging.current = true;
    suppressClick.current = true;
  };
  const rowPointerEnter = (guid: string) => {
    if (dragging.current) apply(guid, dragMode.current);
  };
  const endDrag = () => {
    dragging.current = false;
  };

  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const count = selected.size;

  const bulkOptOut = () => {
    if (count === 0 || pending) return;
    if (
      !window.confirm(
        `Opt out ${count} lead${count === 1 ? "" : "s"}? This cancels anything queued to them, stops their sequences, closes their threads, and marks them "opted out" so they're never messaged again.`,
      )
    )
      return;
    const items = conversations
      .filter((c) => selected.has(c.chatGuid))
      .map((c) => ({ chatGuid: c.chatGuid, contactId: c.contactId }));
    start(async () => {
      await optOutThreads(items);
      exitSelect();
      router.refresh();
    });
  };

  return (
    <div className="space-y-3" onPointerUp={endDrag} onPointerLeave={endDrag}>
      <div className="flex items-center justify-between gap-2">
        {selectMode ? (
          <>
            <span className="text-footnote text-label-secondary tabular-nums">
              {count} selected — tap or drag across leads
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={exitSelect}
                className="press inline-flex items-center gap-1.5 rounded-control border border-hairline px-3 py-1.5 text-footnote font-medium transition-colors duration-fast ease-ios hover:bg-fill-tertiary"
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
              <button
                onClick={bulkOptOut}
                disabled={count === 0 || pending}
                className="press inline-flex items-center gap-1.5 rounded-control bg-danger px-3 py-1.5 text-footnote font-semibold text-white disabled:opacity-40"
              >
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Ban className="h-3.5 w-3.5" />
                )}
                Opt out ({count})
              </button>
            </div>
          </>
        ) : (
          <>
            <span />
            <button
              onClick={() => setSelectMode(true)}
              title="Select multiple leads to opt out at once"
              className="press inline-flex items-center gap-1.5 rounded-control border border-hairline px-3 py-1.5 text-footnote font-medium transition-colors duration-fast ease-ios hover:bg-fill-tertiary"
            >
              <ListChecks className="h-3.5 w-3.5" /> Select
            </button>
          </>
        )}
      </div>

      <ul
        className={cn(
          "divide-y divide-black/[0.06] overflow-hidden rounded-card bg-surface shadow-card ring-1 ring-black/[0.05] dark:divide-white/[0.08] dark:ring-white/[0.08]",
          selectMode && "select-none",
        )}
      >
        {conversations.map((c) => {
          const on = selected.has(c.chatGuid);
          const inner = (
            <>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-caption font-semibold text-accent">
                {initials(c.title)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-subhead font-medium">{c.title}</span>
                  {c.optedOut ? (
                    <span className="shrink-0 rounded-full bg-danger/10 px-1.5 py-0.5 text-caption2 font-medium text-danger">
                      opted out
                    </span>
                  ) : null}
                  <span className="ml-auto shrink-0 text-caption2 text-label-secondary">
                    {new Date(c.dateIso).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <div className="truncate text-caption text-label-secondary">
                  {c.fromMe ? "You: " : ""}
                  {c.preview}
                </div>
              </div>
            </>
          );

          if (selectMode) {
            return (
              <li key={c.chatGuid}>
                <div
                  role="checkbox"
                  aria-checked={on}
                  tabIndex={0}
                  onPointerDown={(e) => rowPointerDown(e, c.chatGuid)}
                  onPointerEnter={() => rowPointerEnter(c.chatGuid)}
                  onClick={() => {
                    if (suppressClick.current) {
                      // mouse selection already handled on pointerdown
                      suppressClick.current = false;
                      return;
                    }
                    toggle(c.chatGuid);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(c.chatGuid);
                    }
                  }}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 px-3 py-3 transition-colors duration-fast ease-ios",
                    on ? "bg-danger/[0.06]" : "hover:bg-fill-tertiary",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-1 transition-colors",
                      on ? "bg-danger text-white ring-danger" : "ring-hairline",
                    )}
                  >
                    {on ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                  <div className="pointer-events-none flex min-w-0 flex-1 items-center gap-3">
                    {inner}
                  </div>
                </div>
              </li>
            );
          }

          return (
            <li key={c.chatGuid} className="flex items-center gap-1 pr-2">
              <Link
                href={`/inbox/${encodeURIComponent(c.chatGuid)}`}
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 transition-colors duration-fast ease-ios hover:bg-fill-tertiary"
              >
                {inner}
              </Link>
              {!c.optedOut ? (
                <OptOutButton chatGuid={c.chatGuid} name={c.title} small />
              ) : null}
              <ChevronRight className="h-4 w-4 shrink-0 text-label-tertiary" />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
