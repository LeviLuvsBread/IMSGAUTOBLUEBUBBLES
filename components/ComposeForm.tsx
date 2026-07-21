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
import {
  Search,
  Check,
  Users,
  UserPlus,
  Loader2,
  Send,
  Clock,
  Sparkles,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { sendBulkNow, sendBulkAuto } from "@/app/(app)/actions";
import { renderForContact } from "@/lib/templating";
import { timeAgo, daysSince, OWNER_TZ } from "@/lib/format";
import { MergeFields } from "@/components/MergeFields";
import { cn } from "@/lib/cn";
import type { Contact, Template } from "@/lib/types";

// Sentinel template-select value for AI auto-opener mode.
const AUTO = "__auto__";
// Selecting someone contacted within this many days flags a re-message warning.
const RECENT_DAYS = 7;

// Contacts clustered into upload sessions by created_at: an import writes all
// its rows within seconds, so any gap bigger than this starts a new upload.
// Two sheets imported back-to-back within the gap read as one session.
const UPLOAD_GAP_MS = 10 * 60 * 1000; // 10 minutes
type UploadGroup = { key: string; label: string; ids: string[]; newest: number };

// "Last contacted" chip for a recipient row — amber if it was recent.
function LastPill({ iso }: { iso?: string }) {
  if (!iso) return null;
  const d = daysSince(iso);
  const recent = d !== null && d < RECENT_DAYS;
  return (
    <span
      suppressHydrationWarning
      title={`Last contacted ${timeAgo(iso)}`}
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 text-caption2 font-medium",
        recent
          ? "bg-warning/15 text-warning"
          : "bg-fill-secondary text-label-tertiary",
      )}
    >
      {timeAgo(iso)}
    </span>
  );
}

export function ComposeForm({
  contacts,
  templates,
  lastContacted,
  lastBatch,
  minDelay,
  jitter,
  dailyCap,
  sentToday,
}: {
  contacts: Contact[];
  templates: Template[];
  lastContacted: Record<string, string>;
  lastBatch: string[];
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

  // "Last recipients": one tap to (de)select everyone from your most recent
  // send session. Toggles like Select-all — selects the batch, or clears it if
  // it's already fully selected.
  const lastBatchSelected =
    lastBatch.length > 0 && lastBatch.every((id) => selected.has(id));
  const toggleLastBatch = () =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (lastBatchSelected) lastBatch.forEach((id) => n.delete(id));
      else lastBatch.forEach((id) => n.add(id));
      return n;
    });
  // When that batch went out (anchor to the most recent one that actually sent).
  const lastBatchIso = lastBatch
    .map((id) => lastContacted[id])
    .find(Boolean);

  // "Uploads": contacts clustered into upload sessions (see UPLOAD_GAP_MS),
  // newest first — a log of every batch you've added. Each session selects
  // with one tap: the newest gets its own chip, the rest live in a dropdown.
  // Labels use the OWNER'S timezone so SSR, browser, and Director's date
  // filters all agree on what day an upload happened (hydration-safe too).
  const uploads = useMemo<UploadGroup[]>(() => {
    const yearFmt = new Intl.DateTimeFormat("en-US", { timeZone: OWNER_TZ, year: "numeric" });
    const dateFmt = new Intl.DateTimeFormat("en-US", {
      timeZone: OWNER_TZ,
      month: "short",
      day: "numeric",
    });
    const dateWithYearFmt = new Intl.DateTimeFormat("en-US", {
      timeZone: OWNER_TZ,
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timeFmt = new Intl.DateTimeFormat("en-US", {
      timeZone: OWNER_TZ,
      hour: "numeric",
      minute: "2-digit",
    });
    const thisYear = yearFmt.format(new Date());
    const rows = contacts
      .map((c) => ({ id: c.id, t: c.created_at ? new Date(c.created_at).getTime() : NaN }))
      .filter((r) => Number.isFinite(r.t))
      .sort((a, b) => b.t - a.t);
    const groups: UploadGroup[] = [];
    let cur: UploadGroup | null = null;
    let prevT = 0;
    for (const r of rows) {
      if (!cur || prevT - r.t > UPLOAD_GAP_MS) {
        cur = { key: String(r.t), label: "", ids: [], newest: r.t };
        groups.push(cur);
      }
      cur.ids.push(r.id);
      prevT = r.t;
    }
    for (const g of groups) {
      const df = yearFmt.format(g.newest) === thisYear ? dateFmt : dateWithYearFmt;
      g.label = `${df.format(g.newest)}, ${timeFmt.format(g.newest)}`;
    }
    return groups;
  }, [contacts]);

  const newestUpload: UploadGroup | undefined = uploads[0];
  const newestUploadSet = useMemo(
    () => new Set(newestUpload?.ids ?? []),
    [newestUpload],
  );
  const isUploadSelected = (g: UploadGroup) =>
    g.ids.length > 0 && g.ids.every((id) => selected.has(id));
  const toggleUpload = (g: UploadGroup) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (isUploadSelected(g)) g.ids.forEach((id) => n.delete(id));
      else g.ids.forEach((id) => n.add(id));
      return n;
    });

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
    () =>
      firstSelected
        ? renderForContact(body, firstSelected, { rand: () => 0 })
        : body,
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

  const auto = templateId === AUTO;
  const outreachTemplates = useMemo(
    () => templates.filter((t) => /cold outreach/i.test(t.name)),
    [templates],
  );
  // How many selected recipients were texted within the last RECENT_DAYS.
  const recentSelected = useMemo(
    () =>
      [...selected].filter((id) => {
        const d = daysSince(lastContacted[id]);
        return d !== null && d < RECENT_DAYS;
      }).length,
    [selected, lastContacted],
  );

  function applyTemplate(id: string) {
    setTemplateId(id);
    if (id === AUTO || id === "") return; // auto / none: body unused or kept
    const t = templates.find((x) => x.id === id);
    if (t) setBody(t.body);
  }

  const send = () => {
    if (count === 0 || pending || (!auto && !body.trim())) return;
    start(async () => {
      const res = auto
        ? await sendBulkAuto([...selected])
        : await sendBulkNow([...selected], body);
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

        {lastBatch.length > 0 || uploads.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {lastBatch.length > 0 ? (
              <button
                type="button"
                onClick={toggleLastBatch}
                title="Select everyone from your most recent send"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-footnote font-medium ring-1 transition-colors duration-fast ease-ios",
                  lastBatchSelected
                    ? "bg-accent text-white ring-accent"
                    : "bg-fill-secondary text-label ring-hairline hover:bg-fill-tertiary",
                )}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {lastBatchSelected ? "Clear last recipients" : "Last recipients"} (
                {lastBatch.length})
                {lastBatchIso ? (
                  <span
                    suppressHydrationWarning
                    className={cn(lastBatchSelected ? "text-white/70" : "text-label-secondary")}
                  >
                    · {timeAgo(lastBatchIso)}
                  </span>
                ) : null}
              </button>
            ) : null}
            {newestUpload ? (
              <button
                type="button"
                onClick={() => toggleUpload(newestUpload)}
                title={`Select the ${newestUpload.ids.length} leads added ${newestUpload.label} — your latest upload`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-footnote font-medium ring-1 transition-colors duration-fast ease-ios",
                  isUploadSelected(newestUpload)
                    ? "bg-accent text-white ring-accent"
                    : "bg-fill-secondary text-label ring-hairline hover:bg-fill-tertiary",
                )}
              >
                <UserPlus className="h-3.5 w-3.5" />
                {isUploadSelected(newestUpload) ? "Clear newest upload" : "Newest upload"} (
                {newestUpload.ids.length})
                <span
                  className={cn(
                    isUploadSelected(newestUpload) ? "text-white/70" : "text-label-secondary",
                  )}
                >
                  · {newestUpload.label}
                </span>
              </button>
            ) : null}
            {uploads.length > 1 ? (
              <select
                value=""
                onChange={(e) => {
                  const g = uploads.find((u) => u.key === e.target.value);
                  if (g) toggleUpload(g);
                }}
                title="Select (or clear) every lead added on a past date"
                className="shrink-0 rounded-full bg-fill-secondary px-3 py-1.5 text-footnote font-medium text-label outline-none ring-1 ring-hairline transition-colors duration-fast ease-ios hover:bg-fill-tertiary"
              >
                <option value="" disabled>
                  Past uploads…
                </option>
                {uploads.slice(1, 21).map((g) => (
                  <option key={g.key} value={g.key}>
                    {isUploadSelected(g) ? "✓ " : ""}
                    {g.label} · {g.ids.length} lead{g.ids.length === 1 ? "" : "s"}
                  </option>
                ))}
                {uploads.length > 21 ? (
                  <option value="" disabled>
                    …{uploads.length - 21} older (find them by search or tag)
                  </option>
                ) : null}
              </select>
            ) : null}
          </div>
        ) : null}

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
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-subhead">{c.name}</span>
                        {newestUploadSet.has(c.id) ? (
                          <span className="shrink-0 rounded-full bg-success/15 px-1.5 py-0.5 text-caption2 font-medium text-success">
                            new
                          </span>
                        ) : null}
                        <LastPill iso={lastContacted[c.id]} />
                      </span>
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
          <div className="mb-3">
            <label className="mb-1 block text-footnote font-medium text-label-secondary">
              Outreach
            </label>
            <select
              value={templateId}
              onChange={(e) => applyTemplate(e.target.value)}
              className="w-full rounded-control bg-fill px-3 py-2 text-subhead outline-none focus:bg-fill-secondary"
            >
              <option value="">None (write your own)</option>
              <option value={AUTO}>✨ Auto — AI writes a unique opener per person</option>
              {templates.length > 0 ? (
                <optgroup label="Templates">
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </div>

          {auto ? (
            <div className="rounded-control border border-accent/25 bg-accent/[0.05] p-3">
              <div className="flex items-center gap-1.5 text-subhead font-medium text-accent">
                <Sparkles className="h-4 w-4" /> AI writes each opener
              </div>
              <p className="mt-1.5 text-caption text-label-secondary">
                Every person gets a unique, on-message opener — written just
                before it sends and anchored to{" "}
                {outreachTemplates.length > 0
                  ? outreachTemplates.map((t) => t.name).join(", ")
                  : "your cold-outreach starters"}
                , so no two texts are identical. If the AI can’t generate, it
                falls back to a varied template. Never quotes rates or amounts.
              </p>
            </div>
          ) : (
            <>
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
            </>
          )}
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
          {recentSelected > 0 ? (
            <p className="mb-2 flex items-start gap-1.5 text-caption text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {recentSelected} of {count} selected{" "}
              {recentSelected === 1 ? "was" : "were"} contacted in the last{" "}
              {RECENT_DAYS} days — double-check you’re not re-texting them.
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
            disabled={count === 0 || (!auto && !body.trim()) || pending}
            className="press inline-flex w-full items-center justify-center gap-2 rounded-control bg-accent px-6 py-3 text-body font-semibold text-white disabled:opacity-40"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : auto ? (
              <Sparkles className="h-4 w-4" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {count === 0
              ? "Select recipients"
              : auto
                ? `AI-write & send to ${count} contact${count === 1 ? "" : "s"}`
                : `Send to ${count} contact${count === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
