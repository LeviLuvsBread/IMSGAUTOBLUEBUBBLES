import { Skeleton } from "@/components/Skeleton";

const ROWS: { side: "in" | "out"; w: string }[] = [
  { side: "in", w: "w-2/5" },
  { side: "in", w: "w-3/5" },
  { side: "out", w: "w-1/2" },
  { side: "in", w: "w-2/5" },
  { side: "out", w: "w-3/5" },
  { side: "out", w: "w-1/3" },
];

export default function Loading() {
  return (
    <div className="space-y-3 py-3">
      <Skeleton className="h-6 w-36 rounded-lg" />
      <div className="space-y-2">
        {ROWS.map((r, i) => (
          <div
            key={i}
            className={r.side === "out" ? "flex justify-end" : "flex justify-start"}
          >
            <Skeleton className={`h-9 rounded-[20px] ${r.w}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
