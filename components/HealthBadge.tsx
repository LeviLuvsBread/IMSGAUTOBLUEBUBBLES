"use client";

import { useEffect, useState } from "react";

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

  const color =
    ok == null ? "bg-neutral-400" : ok ? "bg-green-500" : "bg-red-500";
  const label = ok == null ? "Bridge…" : ok ? "Bridge online" : "Bridge offline";

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
