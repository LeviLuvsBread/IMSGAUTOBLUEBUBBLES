"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2 } from "lucide-react";
import { seedStarterTemplates } from "@/app/(app)/actions";

export function SeedTemplatesButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const run = () =>
    start(async () => {
      const res = await seedStarterTemplates();
      setMsg(
        res.added > 0
          ? `Added ${res.added} template${res.added === 1 ? "" : "s"}`
          : "All starter templates already loaded",
      );
      router.refresh();
      setTimeout(() => setMsg(null), 4000);
    });

  return (
    <div className="flex items-center gap-2">
      {msg ? (
        <span className="text-caption text-label-secondary">{msg}</span>
      ) : null}
      <button
        onClick={run}
        disabled={pending}
        title="Load a ready-made library of MCA / funding outreach templates"
        className="press inline-flex items-center gap-2 rounded-control border border-hairline px-3 py-2 text-footnote font-medium transition-colors duration-fast ease-ios hover:bg-fill-tertiary disabled:opacity-40"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        Load starter pack
      </button>
    </div>
  );
}
