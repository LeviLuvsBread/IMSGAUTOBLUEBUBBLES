"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import {
  PenSquare,
  Megaphone,
  Inbox,
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Pause,
  RotateCcw,
  ChevronRight,
  Info,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Tooltip } from "@/components/Tooltip";

type Reply = { id: string; chatGuid: string; body: string };
type Failed = { id: string; chatGuid: string; body: string; error: string | null };

export type DashboardData = {
  sentToday: number;
  dailyCap: number;
  queued: number;
  failed: number;
  paused: boolean;
  minDelay: number;
  maxDelay: number;
  replies: Reply[];
  failedRows: Failed[];
};

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 380, damping: 32 },
  },
};

const cardBase =
  "rounded-card bg-surface shadow-card ring-1 ring-black/[0.04] dark:ring-white/[0.06]";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function initials(s: string) {
  const m = s.replace(/[^a-zA-Z0-9]/g, "");
  return (m.slice(0, 2) || "··").toUpperCase();
}

/** Small "ⓘ" affordance with an explanatory tooltip (hover or tap/focus). */
function InfoDot({ tip }: { tip: string }) {
  return (
    <Tooltip side="left" className="absolute right-3 top-3" label={tip}>
      <button
        type="button"
        aria-label="What does this mean?"
        className="text-label-tertiary transition-colors duration-fast ease-ios hover:text-label-secondary"
      >
        <Info className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}

function Ring({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        strokeWidth="6"
        className="stroke-black/10 dark:stroke-white/10"
      />
      <motion.circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        className={cn(pct >= 1 ? "stroke-warning" : "stroke-accent")}
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - pct) }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  info,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  sub: string;
  tone: "blue" | "red" | "neutral";
  info: string;
}) {
  const toneCls =
    tone === "red"
      ? "text-danger bg-danger/10"
      : tone === "blue"
        ? "text-accent bg-accent/10"
        : "text-label-secondary bg-fill-tertiary";
  return (
    <motion.div variants={item} className={cn(cardBase, "relative p-5")}>
      <InfoDot tip={info} />
      <span
        className={cn(
          "mb-3 inline-flex h-8 w-8 items-center justify-center rounded-control",
          toneCls,
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="text-h5 tabular-nums">{value}</div>
      <div className="text-footnote text-label-secondary">{label}</div>
      <div className="mt-0.5 text-caption text-label-secondary">{sub}</div>
    </motion.div>
  );
}

function Action({
  href,
  icon: Icon,
  title,
  sub,
  primary,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  sub: string;
  primary?: boolean;
}) {
  return (
    <Link href={href} className="block">
      <motion.div
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className={cn(
          "flex h-full items-center gap-3 rounded-card p-4",
          primary ? "bg-accent text-white shadow-card" : cardBase,
        )}
      >
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-row",
            primary ? "bg-white/20" : "bg-accent/10 text-accent",
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-subhead font-medium">{title}</span>
          <span
            className={cn(
              "block truncate text-caption",
              primary ? "text-white/75" : "text-label-secondary",
            )}
          >
            {sub}
          </span>
        </span>
      </motion.div>
    </Link>
  );
}

export function Dashboard({
  sentToday,
  dailyCap,
  queued,
  failed,
  paused,
  minDelay,
  maxDelay,
  replies,
  failedRows,
  requeue,
}: DashboardData & { requeue: (formData: FormData) => void }) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={item} className="flex items-end justify-between">
        <div>
          <p className="text-footnote text-label-secondary">{greeting()}</p>
          <h1 className="text-h4 font-display">Dashboard</h1>
        </div>
        <Tooltip
          side="left"
          label={
            paused
              ? "Sending is paused — nothing goes out until you resume it in Settings."
              : "The send pump is active and sending on your throttle schedule."
          }
        >
          {paused ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1 text-caption font-medium text-warning">
              <Pause className="h-3 w-3" /> Paused
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-caption font-medium text-success">
              <CheckCircle2 className="h-3 w-3" /> Active
            </span>
          )}
        </Tooltip>
      </motion.div>

      {/* Stat cards */}
      <motion.div
        variants={container}
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <motion.div
          variants={item}
          className={cn(cardBase, "relative col-span-2 flex items-center gap-4 p-5 lg:col-span-1")}
        >
          <InfoDot tip="Messages sent today vs. your daily cap. The cap keeps your number under informal limits so it doesn’t get flagged — raise it slowly." />
          <Ring value={sentToday} max={dailyCap} />
          <div>
            <div className="text-h5 tabular-nums">
              {sentToday}
              <span className="text-title3 text-label-secondary">/{dailyCap}</span>
            </div>
            <div className="text-footnote text-label-secondary">Sent today</div>
          </div>
        </motion.div>
        <StatCard
          icon={Clock}
          label="Queued"
          value={queued}
          tone="blue"
          sub="waiting to send"
          info="Messages waiting in line. They drip out automatically under your throttle settings — you don’t need to do anything."
        />
        <StatCard
          icon={AlertTriangle}
          label="Failed"
          value={failed}
          tone={failed > 0 ? "red" : "neutral"}
          sub="needs attention"
          info="Sends that didn’t go through (bridge offline, bad number, etc.). Use Requeue below to try them again."
        />
        <StatCard
          icon={TrendingUp}
          label="Spacing"
          value={`${minDelay}–${maxDelay}s`}
          tone="neutral"
          sub="delay between sends"
          info="A random pause between each send so your texting looks human. Adjust the min delay and jitter in Settings."
        />
      </motion.div>

      {/* Quick actions */}
      <motion.div
        variants={item}
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <Action
          href="/compose"
          icon={PenSquare}
          title="New message"
          sub="Send a one-off or templated text"
          primary
        />
        <Action
          href="/campaigns/new"
          icon={Megaphone}
          title="New campaign"
          sub="Bulk outreach with throttling"
        />
        <Action
          href="/inbox"
          icon={Inbox}
          title="Open inbox"
          sub="See replies in real time"
        />
      </motion.div>

      {/* Recent replies */}
      <motion.section variants={item} className={cn(cardBase, "p-2")}>
        <div className="flex items-center justify-between px-3 py-2">
          <h2 className="text-subhead font-semibold">Recent replies</h2>
          <Link
            href="/inbox"
            className="text-footnote text-accent transition-opacity duration-fast ease-ios hover:opacity-70"
          >
            View all
          </Link>
        </div>
        {replies.length === 0 ? (
          <div className="px-3 py-8 text-center text-subhead text-label-secondary">
            No replies yet
          </div>
        ) : (
          <ul>
            {replies.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/inbox/${encodeURIComponent(r.chatGuid)}`}
                  className="flex items-center gap-3 rounded-row px-3 py-2 transition-colors duration-fast ease-ios hover:bg-fill-tertiary"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-caption font-semibold text-accent">
                    {initials(r.chatGuid)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-subhead">{r.body}</span>
                    <span className="block truncate text-caption text-label-secondary">
                      {r.chatGuid}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-label-tertiary" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </motion.section>

      {/* Failed sends */}
      {failedRows.length > 0 ? (
        <motion.section
          variants={item}
          className="rounded-card border border-danger/20 bg-danger/[0.04] p-2"
        >
          <h2 className="flex items-center gap-1.5 px-3 py-2 text-subhead font-semibold text-danger">
            <AlertTriangle className="h-4 w-4" /> Failed sends
          </h2>
          <ul>
            {failedRows.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-subhead">{m.body}</span>
                  <span className="block truncate text-caption text-label-secondary">
                    {m.chatGuid}
                    {m.error ? ` · ${m.error}` : ""}
                  </span>
                </span>
                <form action={requeue}>
                  <input type="hidden" name="id" value={m.id} />
                  <Tooltip side="left" label="Put this message back in the send queue to try again.">
                    <button className="press flex items-center gap-1 rounded-control border border-hairline px-2.5 py-1 text-footnote transition-colors duration-fast ease-ios hover:bg-fill-tertiary">
                      <RotateCcw className="h-3 w-3" /> Requeue
                    </button>
                  </Tooltip>
                </form>
              </li>
            ))}
          </ul>
        </motion.section>
      ) : null}
    </motion.div>
  );
}
