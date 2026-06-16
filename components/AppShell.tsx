"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, Search } from "lucide-react";
import { NAV_ITEMS } from "./nav-items";
import { HealthBadge } from "./HealthBadge";
import { CommandPalette } from "./CommandPalette";
import { cn } from "@/lib/cn";

function pageTitle(pathname: string) {
  if (pathname === "/") return "Home";
  const item = NAV_ITEMS.find((n) => n.href !== "/" && pathname.startsWith(n.href));
  return item?.label ?? "";
}

export function AppShell({
  children,
  signOut,
}: {
  children: React.ReactNode;
  signOut: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const isActive = useCallback(
    (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href)),
    [pathname],
  );

  // Global keyboard shortcuts: ⌘K palette, "/" palette, "c" compose, and the
  // Linear-style "g <key>" navigation chord.
  useEffect(() => {
    let pendingG = false;
    let gTimer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (e.key === "Escape") {
        setPaletteOpen(false);
        return;
      }
      if (typing || paletteOpen || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "/") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (pendingG) {
        pendingG = false;
        if (gTimer) clearTimeout(gTimer);
        const item = NAV_ITEMS.find((n) => n.key === e.key.toLowerCase());
        if (item) {
          e.preventDefault();
          router.push(item.href);
        }
        return;
      }
      if (e.key.toLowerCase() === "g") {
        pendingG = true;
        gTimer = setTimeout(() => {
          pendingG = false;
        }, 1200);
        return;
      }
      if (e.key.toLowerCase() === "c") {
        e.preventDefault();
        router.push("/compose");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (gTimer) clearTimeout(gTimer);
    };
  }, [router, paletteOpen]);

  return (
    <div className="app-bg flex min-h-screen">
      {/* Sidebar — desktop */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-1 border-r border-black/5 px-3 py-4 dark:border-white/10 md:flex">
        <Link href="/" className="mb-4 flex items-center gap-2 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-imsg-blue text-white shadow-glass">
            <MessageCircle className="h-4 w-4" />
          </span>
          <span className="font-semibold tracking-tight">Outreach</span>
        </Link>

        <button
          onClick={() => setPaletteOpen(true)}
          className="mb-3 flex items-center gap-2 rounded-xl border border-black/5 bg-white/60 px-3 py-2 text-sm text-neutral-400 transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="rounded-md border border-black/10 px-1 text-[10px] dark:border-white/15">
            ⌘K
          </kbd>
        </button>

        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV_ITEMS.map((n) => {
            const active = isActive(n.href);
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "text-imsg-blue"
                    : "text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/5",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 -z-0 rounded-xl bg-imsg-blue/10"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <Icon className="relative z-10 h-4 w-4" />
                <span className="relative z-10">{n.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex items-center justify-between gap-2 px-1">
          <HealthBadge />
          <form action={signOut}>
            <button className="text-xs text-neutral-400 transition hover:text-neutral-700 dark:hover:text-neutral-200">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass safe-top sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2 md:hidden">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-imsg-blue text-white">
              <MessageCircle className="h-3.5 w-3.5" />
            </span>
            <span className="font-semibold">Outreach</span>
          </div>
          <h1 className="hidden text-sm font-medium text-neutral-500 md:block">
            {pageTitle(pathname)}
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPaletteOpen(true)}
              aria-label="Search"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-black/5 bg-white/60 text-neutral-500 transition hover:bg-white dark:border-white/10 dark:bg-white/5 md:hidden"
            >
              <Search className="h-4 w-4" />
            </button>
            <span className="md:hidden">
              <HealthBadge />
            </span>
          </div>
        </header>

        <main className="flex-1 px-4 py-5 pb-28 md:px-8 md:pb-10">
          <div className="mx-auto w-full max-w-5xl">
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Bottom tab bar — mobile */}
      <nav className="glass-strong safe-bottom fixed inset-x-0 bottom-0 z-30 flex items-center justify-around px-2 pt-2 md:hidden">
        {NAV_ITEMS.slice(0, 5).map((n) => {
          const active = isActive(n.href);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1 text-[10px] font-medium transition-colors",
                active ? "text-imsg-blue" : "text-neutral-400",
              )}
            >
              <Icon className="h-5 w-5" />
              {n.label}
            </Link>
          );
        })}
      </nav>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
