"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

/**
 * Keeps the (server-rendered) inbox list live: subscribes to message changes
 * and re-fetches the list (debounced) when a reply or receipt arrives.
 * Renders nothing.
 */
export function InboxRealtime() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      // Authenticate the realtime socket so RLS lets us receive our own rows.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session?.access_token) {
        supabase.realtime.setAuth(data.session.access_token);
      }
      channel = supabase
        .channel("inbox-stream")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "messages" },
          () => {
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => router.refresh(), 400);
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
