"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Home" },
  { href: "/inbox", label: "Inbox" },
  { href: "/compose", label: "Compose" },
  { href: "/contacts", label: "Contacts" },
  { href: "/templates", label: "Templates" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/scheduler", label: "Scheduler" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 py-2">
      {ITEMS.map((item) => {
        const active =
          item.href === "/" ? path === "/" : path.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition ${
              active
                ? "bg-imsg-blue text-white"
                : "text-neutral-600 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-800"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
