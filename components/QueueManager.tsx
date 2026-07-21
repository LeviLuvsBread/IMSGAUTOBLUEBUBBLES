"use client";

import { useRef, useState, useTransition } from "react";
import {
  AnimatePresence,
  motion,
  Reorder,
  useDragControls,
} from "framer-motion";
import {
  GripVertical,
  Trash2,
  Loader2,
  Check,
  ListOrdered,
  Pause,
  ArrowUpToLine,
  ArrowDownToLine,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { humanizeSeconds } from "@/lib/throttle";

export type QueueItem = {
  id: string;
  name: string;
  phone: string;
  body: string;
  source: string;
};

export type FailedItem = {
  id: string;
  name: string;
  phone: string;
  body: string;
  error: string | null;
};

function initials(s: string) {
  const m = (s || "").replace(/[^a-zA-Z0-9]/g, "");
  return (m.slice(0, 2) || "··").toUpperCase();
}

const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  bulk: "Campaign",
  scheduled: "Scheduled",
  sequence: "Sequence",
  reply: "Reply",
  ai: "AI",
  auto_outreach: "Auto (AI)",
};

function Row({
  item,
  position,
  isNext,
  onCommit,
  onTop,
  onBottom,
}: {
  item: QueueItem;
  position: number;
  isNext: boolean;
  onCommit: () => void;
  onTop: () => void;
  onBottom: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onCommit}
      // Apple Music feel: lift, scale and shadow while dragging; spring back.
      whileDrag={{
        scale: 1.03,
        boxShadow: "0 12px 32px rgba(0,0,0,0.22)",
        cursor: "grabbing",
      }}
      style={{ position: "relative" }}
      transition={{ type: "spring", stiffness: 600, damping: 40 }}
      className={cn(
        "flex touch-none items-center gap-3 rounded-card bg-surface px-3 py-2.5 ring-1 ring-black/[0.05] dark:ring-white/[0.08]",
        isNext && "ring-accent/40",
      )}
    >
      {/* drag handle — only this initiates the drag */}
      <button
        type="button"
        aria-label="Drag to reorder"
        onPointerDown={(e) => controls.start(e)}
        className="-ml-1 flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-label-tertiary transition-colors hover:text-label-secondary active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <span className="w-5 shrink-0 text-center text-caption tabular-nums text-label-tertiary">
        {position}
      </span>

      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-caption font-semibold text-accent">
        {initials(item.name || item.phone)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-subhead font-medium">
            {item.name || item.phone}
          </span>
          {isNext ? (
            <span className="shrink-0 rounded-full bg-accent/10 px-1.5 py-0.5 text-caption2 font-medium text-accent">
              Next
            </span>
          ) : null}
        </span>
        <span className="block truncate text-caption text-label-secondary">
          {item.body || "—"}
        </span>
      </span>

      <span className="hidden shrink-0 text-caption2 text-label-tertiary sm:block">
        {SOURCE_LABEL[item.source] ?? item.source}
      </span>

      {/* quick jump to top / bottom (handy on touch where dragging far is hard) */}
      <span className="flex shrink-0 flex-col">
        <button
          type="button"
          onClick={onTop}
          aria-label="Move to top"
          className="flex h-4 w-6 items-center justify-center text-label-tertiary transition-colors hover:text-accent"
        >
          <ArrowUpToLine className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onBottom}
          aria-label="Move to bottom"
          className="flex h-4 w-6 items-center justify-center text-label-tertiary transition-colors hover:text-accent"
        >
          <ArrowDownToLine className="h-3 w-3" />
        </button>
      </span>
    </Reorder.Item>
  );
}

export function QueueManager({
  initial,
  failed,
  paused,
  minDelay,
  maxDelay,
  clearQueue,
  reorderQueue,
  requeue,
}: {
  initial: QueueItem[];
  failed: FailedItem[];
  paused: boolean;
  minDelay: number;
  maxDelay: number;
  clearQueue: () => Promise<{ canceled: number }>;
  reorderQueue: (orderedIds: string[]) => void | Promise<void>;
  requeue: (formData: FormData) => void;
}) {
  const [items, setItems] = useState<QueueItem[]>(initial);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const [savePending, startSave] = useTransition();
  const [clearPending, startClear] = useTransition();
  const [saved, setSaved] = useState(false);

  const persist = (next: QueueItem[]) => {
    setItems(next);
    startSave(async () => {
      await reorderQueue(next.map((i) => i.id));
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  // Called when a drag gesture ends — itemsRef already holds the live order.
  const commit = () => persist(itemsRef.current);

  const moveTo = (id: string, edge: "top" | "bottom") => {
    const cur = itemsRef.current;
    const found = cur.find((i) => i.id === id);
    if (!found) return;
    const rest = cur.filter((i) => i.id !== id);
    persist(edge === "top" ? [found, ...rest] : [...rest, found]);
  };

  const clear = () => {
    if (
      !confirm(
        `Clear the queue? This cancels all ${items.length} waiting message${items.length === 1 ? "" : "s"}.`,
      )
    )
      return;
    startClear(async () => {
      await clearQueue();
      setItems([]);
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-h4 font-display">
            <ListOrdered className="h-6 w-6 text-accent" /> Queue
          </h1>
          <p className="mt-1 text-footnote text-label-secondary">
            {items.length > 0 ? (
              <>
                {items.length} waiting · top of the list sends first ·{" "}
                {maxDelay > 0
                  ? `~every ${humanizeSeconds(minDelay)}–${humanizeSeconds(maxDelay)}`
                  : "throttled"}
              </>
            ) : (
              "Nothing waiting to send."
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <AnimatePresence>
            {savePending || saved ? (
              <motion.span
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="inline-flex items-center gap-1 text-caption text-label-secondary"
              >
                {savePending ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" /> Saving order…
                  </>
                ) : (
                  <>
                    <Check className="h-3 w-3 text-success" /> Order saved
                  </>
                )}
              </motion.span>
            ) : null}
          </AnimatePresence>

          {items.length > 0 ? (
            <button
              onClick={clear}
              disabled={clearPending}
              className="press inline-flex items-center gap-1.5 rounded-control border border-danger/30 px-3 py-2 text-subhead font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
            >
              {clearPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Clear queue
            </button>
          ) : null}
        </div>
      </div>

      {paused ? (
        <div className="flex items-center gap-2 rounded-card bg-warning/10 px-3 py-2 text-caption font-medium text-warning">
          <Pause className="h-3.5 w-3.5" />
          Sending is paused — resume it from the Dashboard. Reordering still
          works and takes effect when you resume.
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-card bg-surface px-4 py-16 text-center text-subhead text-label-secondary ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
          The queue is empty.
        </div>
      ) : (
        <Reorder.Group
          axis="y"
          values={items}
          onReorder={setItems}
          className="space-y-2"
        >
          {items.map((item, i) => (
            <Row
              key={item.id}
              item={item}
              position={i + 1}
              isNext={i === 0}
              onCommit={commit}
              onTop={() => moveTo(item.id, "top")}
              onBottom={() => moveTo(item.id, "bottom")}
            />
          ))}
        </Reorder.Group>
      )}

      {failed.length > 0 ? (
        <section
          id="failed"
          className="rounded-card border border-danger/20 bg-danger/[0.04] p-2"
        >
          <h2 className="flex items-center gap-1.5 px-3 py-2 text-subhead font-semibold text-danger">
            <AlertTriangle className="h-4 w-4" /> Failed — needs attention (
            {failed.length})
          </h2>
          <ul>
            {failed.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger/10 text-caption font-semibold text-danger">
                  {initials(m.name || m.phone)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-subhead font-medium">
                    {m.name || m.phone}
                  </span>
                  <span className="block truncate text-caption text-label-secondary">
                    {m.body || "—"}
                    {m.error ? ` · ${m.error}` : ""}
                  </span>
                </span>
                <form action={requeue}>
                  <input type="hidden" name="id" value={m.id} />
                  <button className="press inline-flex items-center gap-1 rounded-control border border-hairline px-2.5 py-1 text-footnote transition-colors duration-fast ease-ios hover:bg-fill-tertiary">
                    <RotateCcw className="h-3 w-3" /> Requeue
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
