"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type PointerEvent as RPointerEvent,
  type MouseEvent as RMouseEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Search, Check, Users, Loader2, Send, Clock } from "lucide-react";
import { sendBulkNow } from "@/app/(app)/actions";
import { renderForContact } from "@/lib/templating";
import { MergeFields } from "@/components/MergeFields";
import { cn } from "@/lib/cn";
import type { Contact, Template } from "@/lib/types";

export function ComposeForm({
  contacts,
  templates,
  minDelay,
  jitter,
  dailyCap,
  sentToday,
}: {
  contacts: Contact[];
  templates: Template[];
  minDelay: number;
  jitter: number;
  dailyCap: number;
  sentToday: number;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [templateId, setTemplateId] = useState("");
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ queued: number; skipped: number } | null>(
    null,
  );

  const tags = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach((c) => (c.tags ?? []).forEach((t) => set.add(t)));
    return [...set].sort();
  }, [contacts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (tag && !(c.tags ?? []).includes(tag)) return false;
      if (!q) return true;
      return (
        (c.name ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q) ||
        (c.company ?? "").toLowerCase().includes(q)
      );
    });
  }, [contacts, search, tag]);

  const count = selected.size;
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const selectAllFiltered = () =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (allFilteredSelected) filtered.forEach((c) => n.delete(c.id));
      else filtered.forEach((c) => n.add(c.id));
      return n;
    });
  const clearAll = () => setSelected(new Set());

  // Apple/Finder-style drag-to-select (mouse): press a row and sweep across
  // others. Touch taps a single row (so the list still scrolls). Shift-click
  // selects a range.
  const dragging = useRef(false);
  const dragMode = useRef<"add" | "remove">("add");
  const lastIndex = useRef<number | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    const up = () => {
      dragging.current = false;
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  const applyTo = (id: string, mode: "add" | "remove") =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (mode === "add") n.add(id);
      else n.delete(id);
      return n;
    });
  const rangeAdd = (a: number, b: number) =>
    setSelected((prev) => {
      const n = new Set(prev);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      for (let k = lo; k <= hi; k++) if (filtered[k]) n.add(filtered[k].id);
      return n;
    });

  const rowPointerDown = (e: RPointerEvent<HTMLDivElement>, id: string, i: number) => {
    if (e.pointerType !== "mouse") return; // touch: handled on click, keeps scroll
    e.preventDefault();
    if (e.shiftKey && lastIndex.current !== null) {
      rangeAdd(lastIndex.current, i);
    } else {
      const mode: "add" | "remove" = selected.has(id) ? "remove" : "add";
      applyTo(id, mode);
      dragMode.current = mode;
      dragging.current = true;
    }
    lastIndex.current = i;
    suppressClick.current = true;
  };
  const rowPointerEnter = (id: string) => {
    if (dragging.current) applyTo(id, dragMode.current);
  };
  const rowClick = (e: RMouseEvent<HTMLDivElement>, id: string, i: number) => {
    if (suppressClick.current) {
      suppressClick.current = false; // mouse already handled on pointerdown
      return;
    }
    if (e.shiftKey && lastIndex.current !== null) rangeAdd(lastIndex.current, i);
    else toggle(id);
    lastIndex.current = i;
  };

  const firstSelected = useMemo(
    () => contacts.find((c) => selected.has(c.id)),
    [contacts, selected],
  );
  const preview = useMemo(
    () => (firstSelected ? renderForContact(body, firstSelected) : body),
    [body, firstSelected],
  );

  // Rough send-time estimate from the throttle (first goes ~now).
  const avgGap = minDelay + jitter / 2;
  const estSec = Math.max(0, count - 1) * avgGap;
  const estLabel =
    estSec < 1 ? "instant" : estSec < 90 ? `~${Math.round(estSec)}s` : `~${Math.round(estSec / 60)} min`;
  const remainingCap = Math.max(0, dailyCap - sentToday);
  const overCap = count > remainingCap;

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

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (t) setBody(t.body);
  }

  const send = () => {
    if (count === 0 || !body.trim() || pending) return;
    start(async () => {
      const res = await sendBulkNow([...selected], body);
      setResult(res);
      setSelected(new Set());
      router.refresh();
      setTimeout(() => setResult(null), 6000);
    });
  };

  const card =
    "rounded-card bg-surface p-4 shadow-card ring-1 ring-black/[0.05] dark:ring-white/[0.08]";
  const inputCls =
    "w-full rounded-control bg-fill px-3 py-2 text-subhead outline-none transition-colors duration-fast ease-ios placeholder:text-label-secondary focus:bg-fill-secondary";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* ── Recipients picker ── */}
      <div className={card}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-subhead font-semibold">
            <Users className="h-4 w-4 text-label-secondary" /> Recipients
          </h2>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-caption2 font-semibold tabular-nums",
              count > 0
                ? "bg-accent/10 text-accent"
                : "bg-fill-secondary text-label-secondary",
            )}
          >
            {count} selected
          </span>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-label-secondary" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, company"
              className={cn(inputCls, "pl-8")}
            />
          </div>
          {tags.length > 0 ? (
            <select
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className="shrink-0 rounded-control bg-fill px-2 py-2 text-subhead outline-none focus:bg-fill-secondary"
            >
              <option value="">All tags</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <div className="mt-2 flex items-center justify-between text-footnote">
          <button
            type="button"
            onClick={selectAllFiltered}
            className="text-accent hover:underline"
          >
            {allFilteredSelected ? "Deselect" : "Select all"} ({filtered.length})
          </button>
          {count > 0 ? (
            <button
              type="button"
              onClick={clearAll}
              className="text-label-secondary hover:text-label"
            >
              Clear
            </button>
          ) : null}
        </div>

        <p className="mt-1 text-caption2 text-label-secondary">
          Tip: drag across names to select a bunch · shift-click for a range
        </p>
        <ul className="mt-1.5 max-h-[46vh] select-none divide-y divide-black/[0.06] overflow-y-auto rounded-control dark:divide-white/[0.08]">
          {filtered.length === 0 ? (
            <li className="py-8 text-center text-caption text-label-secondary">
              No contacts match.
            </li>
          ) : (
            filtered.map((c, i) => {
              const on = selected.has(c.id);
              return (
                <li key={c.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-pressed={on}
                    onPointerDown={(e) => rowPointerDown(e, c.id, i)}
                    onPointerEnter={() => rowPointerEnter(c.id)}
                    onClick={(e) => rowClick(e, c.id, i)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(c.id);
                        lastIndex.current = i;
                      }
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 px-1 py-2 text-left transition-colors duration-fast ease-ios",
                      on ? "bg-accent/[0.06]" : "hover:bg-fill-tertiary",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] ring-1 transition-colors",
                        on
                          ? "bg-accent text-white ring-accent"
                          : "bg-transparent ring-hairline",
                      )}
                    >
                      {on ? <Check className="h-3.5 w-3.5" /> : null}
                    </span>
                    <span className="pointer-events-none min-w-0 flex-1">
                      <span className="block truncate text-subhead">{c.name}</span>
                      <span className="block truncate text-caption text-label-secondary">
                        {c.phone}
                        {c.company ? ` · ${c.company}` : ""}
                        {c.tags?.length ? ` · ${c.tags.join(", ")}` : ""}
                      </span>
                    </span>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </div>

      {/* ── Message ── */}
      <div className="space-y-4">
        <div className={card}>
          {templates.length > 0 ? (
            <div className="mb-3">
              <label className="mb-1 block text-footnote font-medium text-label-secondary">
                Template
              </label>
              <select
                value={templateId}
                onChange={(e) => applyTemplate(e.target.value)}
                className="w-full rounded-control bg-fill px-3 py-2 text-subhead outline-none focus:bg-fill-secondary"
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

          <label className="mb-1 block text-footnote font-medium text-label-secondary">
            Message
          </label>
          <p className="mb-2 text-caption text-label-secondary">
            Tap to insert a detail that fills in per person:
          </p>
          <MergeFields onInsert={insert} />
          <textarea
            ref={taRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder="Type your message…"
            className={cn(inputCls, "mt-2 resize-y")}
          />
          <div className="mt-1 text-caption text-label-secondary tabular-nums">
            {body.length} characters
          </div>

          {firstSelected ? (
            <div className="mt-3 rounded-control bg-fill p-3">
              <div className="mb-1 text-caption2 font-medium uppercase tracking-wide text-label-secondary">
                Preview → {firstSelected.name}
              </div>
              <div className="whitespace-pre-wrap text-callout">
                {preview || "—"}
              </div>
            </div>
          ) : null}
        </div>

        <div className={card}>
          {count > 1 && avgGap > 0 ? (
            <p className="mb-2 flex items-center gap-1.5 text-caption text-label-secondary">
              <Clock className="h-3.5 w-3.5" /> {estLabel} to send all {count}{" "}
              (drips under your throttle)
            </p>
          ) : null}
          {overCap ? (
            <p className="mb-2 text-caption text-warning">
              Heads up: only {remainingCap} left in today's cap of {dailyCap} —
              the rest will go out tomorrow.
            </p>
          ) : null}
          {result ? (
            <p className="mb-2 text-caption text-success">
              Queued {result.queued} message{result.queued === 1 ? "" : "s"}
              {result.skipped > 0 ? ` · ${result.skipped} skipped (opted out)` : ""}
              .
            </p>
          ) : null}

          <button
            type="button"
            onClick={send}
            disabled={count === 0 || !body.trim() || pending}
            className="press inline-flex w-full items-center justify-center gap-2 rounded-control bg-accent px-6 py-3 text-body font-semibold text-white disabled:opacity-40"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {count === 0
              ? "Select recipients"
              : `Send to ${count} contact${count === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
