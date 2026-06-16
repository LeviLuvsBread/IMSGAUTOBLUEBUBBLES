"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import type { Message, MessageStatus } from "@/lib/types";

function byCreated(a: Message, b: Message) {
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

function statusLabel(s: MessageStatus): string {
  switch (s) {
    case "queued":
      return "Queued";
    case "sending":
      return "Sending…";
    case "sent":
      return "Sent";
    case "delivered":
      return "Delivered";
    case "read":
      return "Read";
    case "failed":
      return "Failed";
    case "canceled":
      return "Canceled";
    default:
      return "";
  }
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function MessageThread({
  chatGuid,
  initial,
}: {
  chatGuid: string;
  initial: Message[];
}) {
  const [messages, setMessages] = useState<Message[]>(initial);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    // Subscribe to all message changes; filter client-side by chat_guid to
    // avoid encoding issues with guid characters in the realtime filter.
    const channel = supabase
      .channel(`thread-${chatGuid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        (payload) => {
          const rec = (payload.new ?? payload.old) as Message;
          if (!rec || rec.chat_guid !== chatGuid) return;
          setMessages((prev) => {
            if (payload.eventType === "INSERT") {
              const m = payload.new as Message;
              if (prev.some((x) => x.id === m.id)) return prev;
              return [...prev, m].sort(byCreated);
            }
            if (payload.eventType === "UPDATE") {
              const m = payload.new as Message;
              return prev.map((x) => (x.id === m.id ? m : x)).sort(byCreated);
            }
            if (payload.eventType === "DELETE") {
              const old = payload.old as Message;
              return prev.filter((x) => x.id !== old.id);
            }
            return prev;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatGuid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-neutral-400">
        No messages yet.
      </p>
    );
  }

  return (
    <div className="space-y-2 py-3">
      {messages.map((m) => {
        const out = m.direction === "out";
        return (
          <div
            key={m.id}
            className={`flex ${out ? "justify-end" : "justify-start"}`}
          >
            <div className="max-w-[80%]">
              <div
                className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                  out
                    ? m.status === "failed"
                      ? "bg-red-500 text-white"
                      : "bg-imsg-blue text-white"
                    : "bg-imsg-gray text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
                }`}
              >
                {m.body}
              </div>
              <div
                className={`mt-0.5 text-[10px] text-neutral-400 ${
                  out ? "text-right" : "text-left"
                }`}
              >
                {fmtTime(m.created_at)}
                {out ? ` · ${statusLabel(m.status)}` : ""}
                {m.error ? ` · ${m.error}` : ""}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
