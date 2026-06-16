"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

export function HealthBadge() {
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        const j = await r.json();
        if (active) setOk(Boolean(j?.bluebubbles?.ok));
      } catch {
        if (active) setOk(false);
      }
    };
    check();
    const t = setInterval(check, 30000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  const dot =
    ok == null ? "bg-neutral-400" : ok ? "bg-green-500" : "bg-red-500";
  const label = ok == null ? "Bridge…" : ok ? "Online" : "Offline";

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-white/60 px-2.5 py-1 text-xs font-medium backdrop-blur dark:border-white/10 dark:bg-white/5">
      <span className="relative flex h-2 w-2">
        {ok ? (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
        ) : null}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", dot)} />
      </span>
      <span className="text-neutral-600 dark:text-neutral-300">{label}</span>
    </span>
  );
}
