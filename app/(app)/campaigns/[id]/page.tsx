import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CampaignProgress } from "@/components/CampaignProgress";
import { setCampaignStatus } from "../../actions";
import type { Campaign } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const campaign = data as Campaign;

  return (
    <div className="max-w-xl space-y-4">
      <Link href="/campaigns" className="text-sm text-imsg-blue hover:underline">
        ← Campaigns
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{campaign.name}</h1>
        <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-xs dark:border-neutral-700">
          {campaign.status}
        </span>
      </div>

      <CampaignProgress campaignId={campaign.id} total={campaign.total} />

      <div className="flex gap-2">
        {campaign.status === "active" ? (
          <form action={setCampaignStatus}>
            <input type="hidden" name="id" value={campaign.id} />
            <input type="hidden" name="status" value="paused" />
            <button className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">
              Pause (cancel unsent)
            </button>
          </form>
        ) : null}
        {campaign.status !== "canceled" && campaign.status !== "done" ? (
          <form action={setCampaignStatus}>
            <input type="hidden" name="id" value={campaign.id} />
            <input type="hidden" name="status" value="canceled" />
            <button className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-red-600 dark:border-neutral-700">
              Cancel
            </button>
          </form>
        ) : null}
      </div>

      <p className="text-xs text-neutral-400">
        Messages drip out under the global throttle (cap{" "}
        {/* shown on Settings */}and spacing). Pausing cancels any messages not
        yet sent.
      </p>
    </div>
  );
}
