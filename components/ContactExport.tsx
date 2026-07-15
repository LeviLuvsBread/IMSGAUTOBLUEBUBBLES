"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import type { Contact } from "@/lib/types";

// Export every contact to a spreadsheet. XLSX opens natively in Excel, Numbers,
// and Google Sheets; SheetJS is loaded on demand (same as the importer) so it
// never bloats the page bundle.
export function ContactExport({
  contacts,
  lastContacted,
}: {
  contacts: Contact[];
  lastContacted: Record<string, string>;
}) {
  const [pending, setPending] = useState(false);

  const run = async () => {
    if (pending || contacts.length === 0) return;
    setPending(true);
    try {
      const XLSX = await import("xlsx");
      const rows = contacts.map((c) => ({
        Name: c.name,
        Phone: c.phone,
        Email: c.email ?? "",
        Company: c.company ?? "",
        Tags: (c.tags ?? []).join(", "),
        Notes: c.notes ?? "",
        "Opted out": c.opted_out ? "yes" : "",
        "Last contacted": lastContacted[c.id]
          ? new Date(lastContacted[c.id]).toLocaleString()
          : "",
        Added: c.created_at ? new Date(c.created_at).toLocaleDateString() : "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      // Reasonable column widths so it opens readable, not all squished.
      ws["!cols"] = [
        { wch: 22 }, // Name
        { wch: 15 }, // Phone
        { wch: 24 }, // Email
        { wch: 26 }, // Company
        { wch: 18 }, // Tags
        { wch: 60 }, // Notes
        { wch: 9 }, // Opted out
        { wch: 20 }, // Last contacted
        { wch: 11 }, // Added
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Contacts");
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `contacts-${stamp}.xlsx`);
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      onClick={run}
      disabled={pending || contacts.length === 0}
      title="Download every contact as an Excel spreadsheet"
      className="press inline-flex items-center gap-2 rounded-control border border-hairline px-4 py-2 text-subhead font-semibold transition-colors duration-fast ease-ios hover:bg-fill-tertiary disabled:opacity-40"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      Export
    </button>
  );
}
