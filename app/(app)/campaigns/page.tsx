import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Campaign } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });
  const campaigns = (data ?? []) as Campaign[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Campaigns</h1>
        <Link
          href="/campaigns/new"
          className="rounded-lg bg-imsg-blue px-3 py-1.5 text-sm font-medium text-white"
        >
          New campaign
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <p className="text-sm text-neutral-400">No campaigns yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link
                href={`/campaigns/${c.id}`}
                className="flex items-center justify-between gap-3 p-3 transition hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-sm text-neutral-500">
                    {c.total} recipients · {c.status}
                  </div>
                </div>
                <span className="text-xs text-neutral-400">
                  {new Date(c.created_at).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
