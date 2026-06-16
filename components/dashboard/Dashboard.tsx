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
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

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
  show: { transition: { staggerChildren: 0.06 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 380, damping: 30 },
  },
};

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
        className={cn(pct >= 1 ? "stroke-orange-500" : "stroke-imsg-blue")}
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - pct) }}
        transition={{ duration: 0.9, ease: "easeOut" }}
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
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  sub: string;
  tone: "blue" | "red" | "neutral";
}) {
  const toneCls =
    tone === "red"
      ? "text-red-500 bg-red-500/10"
      : tone === "blue"
        ? "text-imsg-blue bg-imsg-blue/10"
        : "text-neutral-500 bg-black/5 dark:bg-white/10";
  return (
    <motion.div variants={item} className="glass rounded-2xl p-5 shadow-card">
      <span
        className={cn(
          "mb-3 inline-flex h-8 w-8 items-center justify-center rounded-lg",
          toneCls,
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-0.5 text-[11px] text-neutral-400">{sub}</div>
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
        whileTap={{ scale: 0.98 }}
        className={cn(
          "flex h-full items-center gap-3 rounded-2xl p-4 shadow-card transition-colors",
          primary ? "bg-imsg-blue text-white" : "glass",
        )}
      >
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            primary ? "bg-white/20" : "bg-imsg-blue/10 text-imsg-blue",
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">{title}</span>
          <span
            className={cn(
              "block truncate text-xs",
              primary ? "text-white/70" : "text-neutral-400",
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
          <p className="text-sm text-neutral-400">{greeting()}</p>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        </div>
        {paused ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-600">
            <Pause className="h-3 w-3" /> Sending paused
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1 text-xs font-medium text-green-600">
            <CheckCircle2 className="h-3 w-3" /> Active
          </span>
        )}
      </motion.div>

      {/* Stat cards */}
      <motion.div
        variants={container}
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <motion.div
          variants={item}
          className="glass col-span-2 flex items-center gap-4 rounded-2xl p-5 shadow-card lg:col-span-1"
        >
          <Ring value={sentToday} max={dailyCap} />
          <div>
            <div className="text-2xl font-semibold tracking-tight">
              {sentToday}
              <span className="text-base text-neutral-400">/{dailyCap}</span>
            </div>
            <div className="text-xs text-neutral-500">Sent today</div>
          </div>
        </motion.div>
        <StatCard
          icon={Clock}
          label="Queued"
          value={queued}
          tone="blue"
          sub="waiting to send"
        />
        <StatCard
          icon={AlertTriangle}
          label="Failed"
          value={failed}
          tone={failed > 0 ? "red" : "neutral"}
          sub="needs attention"
        />
        <StatCard
          icon={TrendingUp}
          label="Spacing"
          value={`${minDelay}–${maxDelay}s`}
          tone="neutral"
          sub="delay between sends"
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
      <motion.section variants={item} className="glass rounded-2xl p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent replies</h2>
          <Link href="/inbox" className="text-xs text-imsg-blue hover:underline">
            View all
          </Link>
        </div>
        {replies.length === 0 ? (
          <div className="px-2 py-8 text-center text-sm text-neutral-400">
            No replies yet
          </div>
        ) : (
          <ul className="space-y-1">
            {replies.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/inbox/${encodeURIComponent(r.chatGuid)}`}
                  className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-imsg-blue/10 text-xs font-medium text-imsg-blue">
                    {initials(r.chatGuid)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{r.body}</span>
                    <span className="block truncate text-xs text-neutral-400">
                      {r.chatGuid}
                    </span>
                  </span>
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
          className="rounded-2xl border border-red-500/20 bg-red-500/[0.03] p-4"
        >
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-red-600">
            <AlertTriangle className="h-4 w-4" /> Failed sends
          </h2>
          <ul className="space-y-1">
            {failedRows.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 rounded-xl px-2 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{m.body}</span>
                  <span className="block truncate text-xs text-neutral-400">
                    {m.chatGuid}
                    {m.error ? ` · ${m.error}` : ""}
                  </span>
                </span>
                <form action={requeue}>
                  <input type="hidden" name="id" value={m.id} />
                  <button className="flex items-center gap-1 rounded-lg border border-black/10 px-2 py-1 text-xs transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5">
                    <RotateCcw className="h-3 w-3" /> Requeue
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </motion.section>
      ) : null}
    </motion.div>
  );
}
