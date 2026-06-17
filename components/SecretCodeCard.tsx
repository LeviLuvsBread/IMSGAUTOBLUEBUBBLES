"use client";

import { useState } from "react";
import { Eye, EyeOff, Copy, Check } from "lucide-react";
import { getSetupUrls } from "@/app/(app)/actions";

// Shows a setup URL with its secret masked. The real secret is never in the
// page HTML — it's fetched from the server only when the owner taps Reveal or
// Copy, so it can't be lifted from view-source / dev tools on a casual look.
export function SecretCodeCard({
  label,
  desc,
  kind,
  appUrl,
}: {
  label: string;
  desc: React.ReactNode;
  kind: "webhook" | "pump";
  appUrl: string;
}) {
  const [full, setFull] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const masked =
    kind === "webhook"
      ? `${appUrl}/api/webhook?secret=••••••••••••`
      : `curl -fsS "${appUrl}/api/cron/pump?key=••••••••••••"`;

  const load = async () => {
    if (full) return full;
    const urls = await getSetupUrls();
    const v = kind === "webhook" ? urls.webhookUrl : urls.pumpUrl;
    setFull(v);
    return v;
  };

  const onReveal = async () => {
    if (!revealed) await load();
    setRevealed((r) => !r);
  };

  const onCopy = async () => {
    const v = await load();
    try {
      await navigator.clipboard.writeText(v);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — reveal instead */
      setRevealed(true);
    }
  };

  return (
    <div className="rounded-card bg-surface p-4 ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-subhead font-semibold">{label}</p>
          <p className="mt-0.5 text-caption text-label-secondary">{desc}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onReveal}
            aria-label={revealed ? "Hide secret" : "Reveal secret"}
            title={revealed ? "Hide" : "Reveal"}
            className="press flex h-8 w-8 items-center justify-center rounded-full bg-fill text-label-secondary transition-colors hover:text-label"
          >
            {revealed ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={onCopy}
            aria-label="Copy full URL"
            title="Copy"
            className="press flex h-8 w-8 items-center justify-center rounded-full bg-fill text-label-secondary transition-colors hover:text-label"
          >
            {copied ? (
              <Check className="h-4 w-4 text-success" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
      <code className="mt-2 block overflow-x-auto rounded-control bg-fill px-3 py-2 font-mono text-caption">
        {revealed && full ? full : masked}
      </code>
    </div>
  );
}
