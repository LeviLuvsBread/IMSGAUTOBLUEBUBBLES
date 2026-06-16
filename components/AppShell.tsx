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
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-0.5 border-r border-separator px-3 py-4 md:flex">
        <Link href="/" className="mb-4 flex items-center gap-2.5 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-row bg-accent text-white">
            <MessageCircle className="h-[18px] w-[18px]" />
          </span>
          <span className="text-[17px] font-semibold tracking-[-0.022em]">Outreach</span>
        </Link>

        <button
          onClick={() => setPaletteOpen(true)}
          className="press mb-3 flex items-center gap-2 rounded-row bg-fill px-3 py-2 text-reduced text-label-secondary transition-colors duration-fast ease-ios hover:bg-fill-secondary"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Search</span>
          <kbd className="rounded-control bg-fill-secondary px-1.5 py-0.5 text-caption2 text-label-secondary">
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
                  "group relative flex items-center gap-3 rounded-row px-3 py-2 text-reduced font-medium transition-colors duration-fast ease-ios",
                  active
                    ? "text-accent"
                    : "text-label-secondary hover:bg-fill-tertiary",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 -z-0 rounded-row bg-accent/10"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <Icon className="relative z-10 h-[18px] w-[18px]" />
                <span className="relative z-10">{n.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex items-center justify-between gap-2 px-1">
          <HealthBadge />
          <form action={signOut}>
            <button className="text-footnote text-label-secondary transition-colors duration-fast ease-ios hover:text-label">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass hairline-b safe-top sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2 md:hidden">
            <span className="flex h-7 w-7 items-center justify-center rounded-row bg-accent text-white">
              <MessageCircle className="h-4 w-4" />
            </span>
            <span className="text-[17px] font-semibold tracking-[-0.022em]">Outreach</span>
          </div>
          <h1 className="hidden text-reduced font-medium text-label-secondary md:block">
            {pageTitle(pathname)}
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPaletteOpen(true)}
              aria-label="Search"
              className="press flex h-8 w-8 items-center justify-center rounded-full bg-fill text-label-secondary md:hidden"
            >
              <Search className="h-4 w-4" />
            </button>
            <span className="md:hidden">
              <HealthBadge />
            </span>
          </div>
        </header>

        <main className="flex-1 px-4 py-5 pb-28 md:px-8 md:pb-10">
          <div className="mx-auto w-full max-w-content">
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25, ease: [0, 0, 0.58, 1] }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Bottom tab bar — mobile */}
      <nav className="material-bar hairline-t safe-bottom fixed inset-x-0 bottom-0 z-30 flex items-center justify-around px-2 pt-1.5 md:hidden">
        {NAV_ITEMS.slice(0, 5).map((n) => {
          const active = isActive(n.href);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "press flex flex-1 flex-col items-center gap-0.5 rounded-control py-1.5 text-caption2",
                active ? "text-accent" : "text-sysgray",
              )}
            >
              <Icon className="h-6 w-6" />
              {n.label}
            </Link>
          );
        })}
      </nav>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
