"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  type LucideIcon,
} from "lucide-react";
import { NAV_ITEMS } from "./nav-items";
import { cn } from "@/lib/cn";

type Cmd = {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  group: string;
  run: () => void;
};

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Cmd[]>(() => {
    const actions: Cmd[] = [
      {
        id: "act:new-msg",
        label: "New message",
        hint: "C",
        icon: NAV_ITEMS[2].icon,
        group: "Actions",
        run: () => router.push("/compose"),
      },
      {
        id: "act:new-camp",
        label: "New campaign",
        icon: NAV_ITEMS[5].icon,
        group: "Actions",
        run: () => router.push("/campaigns/new"),
      },
    ];
    const nav: Cmd[] = NAV_ITEMS.map((n) => ({
      id: `nav:${n.href}`,
      label: `Go to ${n.label}`,
      hint: `G ${n.key.toUpperCase()}`,
      icon: n.icon,
      group: "Navigate",
      run: () => router.push(n.href),
    }));
    return [...actions, ...nav];
  }, [router]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    setActive(0);
  }, [query, open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      const t = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (c?: Cmd) => {
    if (!c) return;
    onClose();
    c.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(filtered[active]);
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -8 }}
            transition={{ type: "spring", stiffness: 440, damping: 34 }}
            className="glass-strong relative z-10 w-full max-w-xl overflow-hidden rounded-2xl shadow-glass-lg"
          >
            <div className="flex items-center gap-3 border-b border-black/5 px-4 dark:border-white/10">
              <Search className="h-4 w-4 shrink-0 text-neutral-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search commands…"
                className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-neutral-400"
              />
              <kbd className="shrink-0 rounded-md border border-black/10 px-1.5 py-0.5 text-[10px] text-neutral-400 dark:border-white/15">
                ESC
              </kbd>
            </div>

            <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <div className="px-3 py-10 text-center text-sm text-neutral-400">
                  No commands found
                </div>
              ) : (
                filtered.map((c, idx) => {
                  const prev = filtered[idx - 1];
                  const showHeader = !prev || prev.group !== c.group;
                  const isActive = idx === active;
                  const Icon = c.icon;
                  return (
                    <div key={c.id}>
                      {showHeader ? (
                        <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                          {c.group}
                        </div>
                      ) : null}
                      <button
                        data-active={isActive}
                        onMouseMove={() => setActive(idx)}
                        onClick={() => run(c)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                          isActive
                            ? "bg-imsg-blue text-white"
                            : "text-neutral-700 dark:text-neutral-200",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            isActive ? "text-white" : "text-neutral-400",
                          )}
                        />
                        <span className="flex-1">{c.label}</span>
                        {c.hint ? (
                          <kbd
                            className={cn(
                              "rounded-md px-1.5 py-0.5 text-[10px]",
                              isActive
                                ? "bg-white/20 text-white"
                                : "bg-black/5 text-neutral-400 dark:bg-white/10",
                            )}
                          >
                            {c.hint}
                          </kbd>
                        ) : null}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center gap-4 border-t border-black/5 px-4 py-2 text-[11px] text-neutral-400 dark:border-white/10">
              <span className="flex items-center gap-1">
                <ArrowUp className="h-3 w-3" />
                <ArrowDown className="h-3 w-3" /> navigate
              </span>
              <span className="flex items-center gap-1">
                <CornerDownLeft className="h-3 w-3" /> open
              </span>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
