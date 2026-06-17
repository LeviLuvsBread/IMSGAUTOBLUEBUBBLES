"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/cn";
import type { Message, MessageStatus } from "@/lib/types";

function byCreated(a: Message, b: Message) {
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

function receiptLabel(s: MessageStatus): string {
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
      return "Not Delivered";
    case "canceled":
      return "Canceled";
    default:
      return "";
  }
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const GROUP_GAP = 5 * 60 * 1000; // new visual group after a 5-min gap
const TIME_GAP = 60 * 60 * 1000; // show a time separator after a 1-hr gap

type Row =
  | { type: "time"; key: string; t: string }
  | { type: "msg"; m: Message; firstInGroup: boolean; lastInGroup: boolean };

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

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    messages.forEach((m, i) => {
      const prev = messages[i - 1];
      const next = messages[i + 1];
      const prevGap = prev
        ? new Date(m.created_at).getTime() - new Date(prev.created_at).getTime()
        : Infinity;
      const nextGap = next
        ? new Date(next.created_at).getTime() - new Date(m.created_at).getTime()
        : Infinity;
      if (!prev || prevGap > TIME_GAP) {
        out.push({ type: "time", key: `t-${m.id}`, t: m.created_at });
      }
      const firstInGroup =
        !prev || prev.direction !== m.direction || prevGap > GROUP_GAP;
      const lastInGroup =
        !next || next.direction !== m.direction || nextGap > GROUP_GAP;
      out.push({ type: "msg", m, firstInGroup, lastInGroup });
    });
    return out;
  }, [messages]);

  // iMessage shows the receipt only under the final outgoing bubble.
  const lastOutId = useMemo(() => {
    const last = messages[messages.length - 1];
    return last && last.direction === "out" ? last.id : null;
  }, [messages]);

  if (messages.length === 0) {
    return (
      <p className="py-12 text-center text-subhead text-label-secondary">
        No messages yet
      </p>
    );
  }

  return (
    <div className="py-3">
      {rows.map((row) => {
        if (row.type === "time") {
          return (
            <div
              key={row.key}
              className="py-3 text-center text-caption2 font-medium text-label-secondary"
            >
              {fmtTime(row.t)}
            </div>
          );
        }
        const { m, firstInGroup, lastInGroup } = row;
        const out = m.direction === "out";
        const failed = m.status === "failed";
        const showReceipt = out && (failed || m.id === lastOutId);
        return (
          <div
            key={m.id}
            className={cn(
              "flex",
              out ? "justify-end" : "justify-start",
              firstInGroup ? "mt-2" : "mt-0.5",
            )}
          >
            <div
              className={cn(
                "flex max-w-[75%] flex-col",
                out ? "items-end" : "items-start",
              )}
            >
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 34 }}
                className={cn(
                  "w-fit whitespace-pre-wrap break-words rounded-[20px] px-3.5 py-2 text-callout",
                  out
                    ? failed
                      ? "bg-danger text-white"
                      : "bg-accent text-white"
                    : "bg-bubble-received text-label",
                  lastInGroup && (out ? "rounded-br-md" : "rounded-bl-md"),
                )}
              >
                {m.body}
              </motion.div>
              {showReceipt ? (
                <span
                  className={cn(
                    "mt-1 px-1 text-caption2",
                    failed ? "text-danger" : "text-label-secondary",
                  )}
                >
                  {failed ? "Not Delivered" : receiptLabel(m.status)}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
