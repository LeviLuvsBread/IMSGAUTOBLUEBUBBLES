"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Upload, X, Check, Loader2, FileSpreadsheet } from "lucide-react";
import { parseCsv } from "@/lib/csv";
import { importContacts, type ImportResult } from "@/app/(app)/actions";
import { cn } from "@/lib/cn";

type Field = "full" | "first" | "last" | "phone" | "email" | "company" | "tags";
type Mapping = Record<Field, number>;

const FIELDS: { key: Field; label: string; required?: boolean }[] = [
  { key: "full", label: "Full name" },
  { key: "first", label: "First name" },
  { key: "last", label: "Last name" },
  { key: "phone", label: "Phone", required: true },
  { key: "email", label: "Email" },
  { key: "company", label: "Company" },
  { key: "tags", label: "Tags (column)" },
];

function guessMapping(headers: string[]): Mapping {
  const n = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const find = (test: (h: string) => boolean) => n.findIndex(test);
  return {
    phone: find((h) => h.includes("phone") || h.includes("mobile") || h.includes("cell") || h === "tel" || h.includes("number")),
    email: find((h) => h.includes("email") || h.includes("mail")),
    company: find((h) => h.includes("company") || h.includes("business") || h.includes("organization") || h.includes("org")),
    first: find((h) => h.includes("firstname") || h === "first"),
    last: find((h) => h.includes("lastname") || h === "last"),
    full: find((h) => h === "name" || h.includes("fullname") || h.includes("contactname")),
    tags: find((h) => h.includes("tag")),
  };
}

const splitTags = (s: string) =>
  s.split(/[;,]/).map((t) => t.trim()).filter(Boolean);

export function ContactImport() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"upload" | "map" | "done">("upload");
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>({} as Mapping);
  const [tagAll, setTagAll] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => {
    setStep("upload");
    setDragging(false);
    setFileName("");
    setHeaders([]);
    setRows([]);
    setResult(null);
    setTagAll("");
  };

  // dragenter/dragleave fire for every child element, so we track depth with a
  // counter and only drop the highlight once we've truly left the drop zone.
  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    onFile(e.dataTransfer.files?.[0]);
  };

  const close = () => {
    setOpen(false);
    setTimeout(reset, 200);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    let parsed: { headers: string[]; rows: string[][] };
    try {
      if (name.endsWith(".csv") || name.endsWith(".txt") || file.type === "text/csv") {
        // Lightweight path for plain CSV — no need to load the xlsx parser.
        parsed = parseCsv(await file.text());
      } else {
        // Excel (.xlsx/.xls), OpenDocument (.ods), and TSV — parsed by SheetJS,
        // loaded on demand so it never bloats the rest of the app.
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
        parsed = { headers: grid[0] ?? [], rows: grid.slice(1) };
      }
    } catch {
      parsed = { headers: [], rows: [] };
    }
    if (parsed.headers.length === 0) return;
    setFileName(file.name);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping(guessMapping(parsed.headers));
    setStep("map");
  };

  const built = useMemo(() => {
    const tagAllList = splitTags(tagAll);
    const val = (row: string[], f: Field) => {
      const i = mapping[f];
      return i >= 0 ? (row[i] ?? "") : "";
    };
    return rows.map((row) => {
      const full = val(row, "full").trim();
      const name = full || `${val(row, "first")} ${val(row, "last")}`.trim();
      return {
        name,
        phone: val(row, "phone"),
        email: val(row, "email"),
        company: val(row, "company"),
        tags: [...splitTags(val(row, "tags")), ...tagAllList],
      };
    });
  }, [rows, mapping, tagAll]);

  const withPhone = useMemo(
    () => built.filter((b) => b.phone.trim().length > 0).length,
    [built],
  );
  const canImport = (mapping.phone ?? -1) >= 0 && withPhone > 0;

  const doImport = async () => {
    setImporting(true);
    try {
      const res = await importContacts(built);
      setResult(res);
      setStep("done");
      router.refresh();
    } finally {
      setImporting(false);
    }
  };

  const selectCls =
    "rounded-control bg-fill px-2.5 py-1.5 text-subhead outline-none focus:bg-fill-secondary";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="press inline-flex items-center gap-2 rounded-control bg-accent px-4 py-2 text-subhead font-semibold text-white"
      >
        <Upload className="h-4 w-4" /> Import
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[8vh]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
              onClick={close}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.97, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -8 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              className="material-thick relative z-10 flex max-h-[84vh] w-full max-w-2xl flex-col overflow-hidden rounded-card shadow-overlay"
            >
              <div className="flex items-center justify-between gap-3 border-b border-separator px-5 py-4">
                <h2 className="text-title3 font-semibold">Import contacts</h2>
                <button
                  onClick={close}
                  aria-label="Close"
                  className="press flex h-8 w-8 items-center justify-center rounded-full bg-fill text-label-secondary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {step === "upload" ? (
                  <motion.div
                    role="button"
                    tabIndex={0}
                    aria-label="Upload a spreadsheet — click to browse or drop a file here"
                    onClick={() => fileRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        fileRef.current?.click();
                      }
                    }}
                    onDragEnter={onDragEnter}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    whileTap={{ scale: 0.99 }}
                    animate={{ scale: dragging ? 1.015 : 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 26 }}
                    className={cn(
                      "flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed py-12 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent",
                      dragging
                        ? "border-accent bg-accent/[0.06]"
                        : "border-separator hover:bg-fill-tertiary",
                    )}
                  >
                    <motion.span
                      animate={
                        dragging
                          ? { scale: 1.12, y: -3, rotate: -3 }
                          : { scale: 1, y: 0, rotate: 0 }
                      }
                      transition={{ type: "spring", stiffness: 380, damping: 16 }}
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-card transition-colors",
                        dragging ? "bg-accent text-white" : "bg-accent/10 text-accent",
                      )}
                    >
                      <FileSpreadsheet className="h-6 w-6" />
                    </motion.span>
                    <span className="text-subhead font-medium">
                      {dragging ? "Drop to import" : "Choose a spreadsheet"}
                    </span>
                    <span className="text-caption text-label-secondary">
                      {dragging ? (
                        "Release the file anywhere in this box"
                      ) : (
                        <>
                          Drag &amp; drop a file, or click to browse
                          <br />
                          CSV, Excel (.xlsx, .xls), or Numbers/Sheets export (.ods)
                        </>
                      )}
                    </span>
                  </motion.div>
                ) : null}

                {step === "map" ? (
                  <div className="space-y-5">
                    <div className="flex items-center gap-2 text-caption text-label-secondary">
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      {fileName} · {rows.length} rows · {withPhone} with a phone
                    </div>

                    <div className="space-y-2">
                      <p className="text-footnote font-medium text-label-secondary">
                        Map your columns
                      </p>
                      <div className="space-y-1.5">
                        {FIELDS.map((f) => (
                          <div
                            key={f.key}
                            className="flex items-center justify-between gap-3"
                          >
                            <label className="text-subhead">
                              {f.label}
                              {f.required ? (
                                <span className="text-danger"> *</span>
                              ) : null}
                            </label>
                            <select
                              value={mapping[f.key] ?? -1}
                              onChange={(e) =>
                                setMapping((m) => ({
                                  ...m,
                                  [f.key]: Number(e.target.value),
                                }))
                              }
                              className={cn(selectCls, "w-48")}
                            >
                              <option value={-1}>— none —</option>
                              {headers.map((h, i) => (
                                <option key={i} value={i}>
                                  {h}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                        <div className="flex items-center justify-between gap-3 pt-1">
                          <label className="text-subhead">Tag all imported as</label>
                          <input
                            value={tagAll}
                            onChange={(e) => setTagAll(e.target.value)}
                            placeholder="e.g. sms-list"
                            className={cn(selectCls, "w-48 text-left placeholder:text-label-secondary")}
                          />
                        </div>
                      </div>
                    </div>

                    {/* preview */}
                    <div className="space-y-2">
                      <p className="text-footnote font-medium text-label-secondary">
                        Preview
                      </p>
                      <div className="overflow-hidden rounded-card bg-surface ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
                        <div className="grid grid-cols-3 gap-2 border-b border-separator px-3 py-2 text-caption2 uppercase tracking-wide text-label-secondary">
                          <span>Name</span>
                          <span>Phone</span>
                          <span>Company</span>
                        </div>
                        {built.slice(0, 3).map((b, i) => (
                          <div
                            key={i}
                            className="grid grid-cols-3 gap-2 px-3 py-2 text-subhead"
                          >
                            <span className="truncate">{b.name || "—"}</span>
                            <span className="truncate tabular-nums">{b.phone || "—"}</span>
                            <span className="truncate text-label-secondary">{b.company || "—"}</span>
                          </div>
                        ))}
                      </div>
                      {(mapping.phone ?? -1) < 0 ? (
                        <p className="text-caption text-warning">
                          Map a Phone column to continue — contacts need a number to text.
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {step === "done" && result ? (
                  <div className="space-y-4 py-4 text-center">
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
                      <Check className="h-6 w-6" />
                    </span>
                    <div>
                      <p className="text-title3 font-semibold tabular-nums">
                        {result.inserted} contacts imported
                      </p>
                      <p className="mt-1 text-caption text-label-secondary">
                        {result.alreadyInList} already in your list ·{" "}
                        {result.skippedNoPhone} skipped (no valid phone) ·{" "}
                        {result.duplicatesInFile} duplicate rows
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-separator px-5 py-3">
                {step === "map" ? (
                  <>
                    <button
                      onClick={reset}
                      className="rounded-control px-3 py-2 text-subhead text-label-secondary hover:text-label"
                    >
                      Back
                    </button>
                    <button
                      onClick={doImport}
                      disabled={!canImport || importing}
                      className="press inline-flex items-center gap-2 rounded-control bg-accent px-4 py-2 text-subhead font-semibold text-white disabled:opacity-40"
                    >
                      {importing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      Import {withPhone} contacts
                    </button>
                  </>
                ) : (
                  <button
                    onClick={close}
                    className="press rounded-control bg-accent px-4 py-2 text-subhead font-semibold text-white"
                  >
                    Done
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,.tsv,.txt,.xlsx,.xls,.ods,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.oasis.opendocument.spreadsheet"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
    </>
  );
}
