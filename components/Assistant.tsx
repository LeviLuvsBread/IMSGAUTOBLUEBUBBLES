"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, Send, X, Loader2, Check, Paperclip, FileSpreadsheet, FileText } from "lucide-react";
import { parseCsv } from "@/lib/csv";
import { cn } from "@/lib/cn";

type Msg = { role: "user" | "assistant"; content: string };
type Pending = { name: string; args: Record<string, unknown>; summary: string };
type Upload = {
  kind: "sheet" | "file";
  name: string;
  mime: string;
  size: number;
  path: string;
  headers?: string[];
  rows?: string[][];
};

const MAX_SHEET_ROWS = 2000;

// Parse a spreadsheet the same way the Contacts importer does (CSV inline,
// Excel/ODS via on-demand SheetJS). Returns null if it isn't parseable.
async function parseSheet(
  file: File,
): Promise<{ headers: string[]; rows: string[][] } | null> {
  const n = file.name.toLowerCase();
  try {
    if (n.endsWith(".csv") || n.endsWith(".txt") || file.type === "text/csv") {
      const parsed = parseCsv(await file.text());
      return parsed.headers.length ? parsed : null;
    }
    if (/\.(xlsx|xls|ods|tsv)$/.test(n)) {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false,
      }) as unknown[][];
      const grid = aoa
        .map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "").trim()) : []))
        .filter((r) => r.some((c) => c.length > 0));
      if (!grid.length) return null;
      return { headers: grid[0], rows: grid.slice(1) };
    }
  } catch {
    /* not a sheet */
  }
  return null;
}

export function Assistant() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hey — I'm your Director. Ask me to find contacts, text people, check what's going on, or jump to any page. Attach a file with the paperclip and I can import a lead sheet or send the file to people. Anything that sends, I'll show you first.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const onFile = async (file: File | undefined) => {
    if (!file || uploading) return;
    if (file.size > 25 * 1024 * 1024) {
      setMsgs((m) => [...m, { role: "assistant", content: "That file is over 25MB — send something smaller." }]);
      return;
    }
    setUploading(true);
    try {
      // Store the raw bytes (so send_file works for any type)…
      const fd = new FormData();
      fd.set("file", file);
      const r = await fetch("/api/assistant/upload", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok || !d.path) throw new Error(d.error || "upload failed");
      // …and additionally parse spreadsheets so import_contacts has rows.
      const sheet = await parseSheet(file);
      setUpload({
        kind: sheet ? "sheet" : "file",
        name: d.name,
        mime: d.mime,
        size: d.size,
        path: d.path,
        headers: sheet?.headers,
        rows: sheet?.rows.slice(0, MAX_SHEET_ROWS),
      });
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "Couldn't upload that file — try again." }]);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, pending, busy, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: text }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    setPending(null);
    try {
      const r = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, upload }),
      });
      const d = await r.json();
      if (d.reply) setMsgs((m) => [...m, { role: "assistant", content: d.reply }]);
      if (d.action?.kind === "navigate") {
        setMsgs((m) => [...m, { role: "assistant", content: `Opening ${d.action.path} →` }]);
        router.push(d.action.path);
        setTimeout(() => setOpen(false), 400);
      } else if (d.action?.kind === "confirm") {
        setPending(d.action);
      }
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "Something went wrong — try again." }]);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!pending || busy) return;
    const p = pending;
    setPending(null);
    setBusy(true);
    try {
      const r = await fetch("/api/assistant/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: p.name, args: p.args }),
      });
      const d = await r.json();
      setMsgs((m) => [...m, { role: "assistant", content: d.result || "Done." }]);
      router.refresh();
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "Couldn't complete that." }]);
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setPending(null);
    setMsgs((m) => [...m, { role: "assistant", content: "Okay, canceled." }]);
  };

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open assistant"
        className="press fixed bottom-5 right-5 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-glow transition-transform"
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="liquid-glass fixed bottom-24 right-5 z-[60] flex h-[min(70vh,560px)] w-[min(92vw,400px)] flex-col overflow-hidden rounded-card-lg ring-1 ring-white/15"
          >
            <div className="flex items-center gap-2 border-b border-separator px-4 py-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="text-subhead font-semibold">Director</span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="press ml-auto flex h-7 w-7 items-center justify-center rounded-full bg-fill text-label-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {msgs.map((m, i) => (
                <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap break-words rounded-[16px] px-3 py-2 text-callout",
                      m.role === "user"
                        ? "bg-accent text-white"
                        : "bg-surface text-label ring-1 ring-black/[0.05] dark:ring-white/[0.08]",
                    )}
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {pending ? (
                <div className="rounded-card border border-accent/30 bg-accent/[0.06] p-3">
                  <div className="mb-1.5 text-caption2 font-semibold uppercase tracking-wide text-accent">
                    Confirm before it runs
                  </div>
                  <div className="whitespace-pre-wrap text-footnote text-label">{pending.summary}</div>
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      onClick={cancel}
                      className="press rounded-control px-3 py-1.5 text-footnote text-label-secondary hover:bg-fill-tertiary"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirm}
                      className="press inline-flex items-center gap-1 rounded-control bg-accent px-3 py-1.5 text-footnote font-semibold text-white"
                    >
                      <Check className="h-3.5 w-3.5" /> Confirm
                    </button>
                  </div>
                </div>
              ) : null}

              {busy ? (
                <div className="flex justify-start">
                  <div className="rounded-[16px] bg-surface px-3 py-2 ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
                    <Loader2 className="h-4 w-4 animate-spin text-label-secondary" />
                  </div>
                </div>
              ) : null}
              <div ref={endRef} />
            </div>

            <div className="border-t border-separator">
              {upload ? (
                <div className="flex items-center gap-2 px-3 pt-2">
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-caption font-medium text-accent">
                    {upload.kind === "sheet" ? (
                      <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="truncate">
                      {upload.name}
                      {upload.kind === "sheet" && upload.rows
                        ? ` · ${upload.rows.length} rows`
                        : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => setUpload(null)}
                      aria-label="Remove attachment"
                      className="ml-0.5 text-accent/70 hover:text-accent"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                </div>
              ) : null}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="flex items-center gap-2 px-3 py-2.5"
              >
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  aria-label="Attach a file"
                  title="Attach a file — a lead sheet to import, or anything to send to people"
                  className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fill text-label-secondary transition-colors hover:text-label disabled:opacity-40"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Paperclip className="h-4 w-4" />
                  )}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={upload ? "Tell me what to do with it…" : "Ask, or tell me to do something…"}
                  className="flex-1 rounded-full bg-fill px-3.5 py-2 text-callout outline-none transition-colors placeholder:text-label-secondary focus:bg-fill-secondary"
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  aria-label="Send"
                  className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
