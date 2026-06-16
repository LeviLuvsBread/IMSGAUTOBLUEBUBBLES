"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

const STATUS_ORDER = [
  "queued",
  "sending",
  "sent",
  "delivered",
  "read",
  "failed",
  "canceled",
] as const;

export function CampaignProgress({
  campaignId,
  total,
}: {
  campaignId: string;
  total: number;
}) {
  const [supabase] = useState(() => createClient());
  const [counts, setCounts] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("messages")
      .select("status")
      .eq("campaign_id", campaignId);
    const c: Record<string, number> = {};
    for (const r of data ?? []) c[r.status] = (c[r.status] ?? 0) + 1;
    setCounts(c);
  }, [supabase, campaignId]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`camp-${campaignId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        (p) => {
          const rec = (p.new ?? p.old) as { campaign_id?: string };
          if (rec?.campaign_id === campaignId) load();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, campaignId, load]);

  const done =
    (counts.sent ?? 0) +
    (counts.delivered ?? 0) +
    (counts.read ?? 0) +
    (counts.failed ?? 0) +
    (counts.canceled ?? 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        <div
          className="h-full bg-imsg-blue transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-sm text-neutral-500">
        {done} / {total} processed ({pct}%)
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {STATUS_ORDER.map((s) => (
          <span
            key={s}
            className="rounded-full border border-neutral-200 px-2 py-1 dark:border-neutral-800"
          >
            {s}: <strong>{counts[s] ?? 0}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
