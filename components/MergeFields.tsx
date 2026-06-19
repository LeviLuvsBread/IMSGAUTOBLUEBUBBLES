"use client";

// Friendly, click-to-insert merge fields so users never type {{...}} by hand.
const FIELDS = [
  { var: "{{first_name}}", label: "First name" },
  { var: "{{name}}", label: "Full name" },
  { var: "{{company}}", label: "Company" },
  { var: "{{email}}", label: "Email" },
  { var: "{{phone}}", label: "Phone" },
];

export function MergeFields({ onInsert }: { onInsert: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {FIELDS.map((f) => (
        <button
          key={f.var}
          type="button"
          onClick={() => onInsert(f.var)}
          title={`Inserts each person's ${f.label.toLowerCase()}`}
          className="press rounded-full bg-fill px-2.5 py-1 text-caption font-medium text-label-secondary ring-1 ring-hairline transition-colors duration-fast ease-ios hover:bg-accent/10 hover:text-accent"
        >
          + {f.label}
        </button>
      ))}
    </div>
  );
}
