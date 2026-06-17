import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-3 w-20 rounded" />
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>
      {Array.from({ length: 2 }).map((_, s) => (
        <div key={s} className="space-y-2">
          <Skeleton className="ml-4 h-3 w-24 rounded" />
          <div className="divide-y divide-black/[0.06] rounded-card bg-surface shadow-card ring-1 ring-black/[0.05] dark:divide-white/[0.08] dark:ring-white/[0.08]">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-4 px-4 py-3.5"
              >
                <div className="space-y-2">
                  <Skeleton className="h-4 w-28 rounded" />
                  <Skeleton className="h-3 w-44 rounded" />
                </div>
                <Skeleton className="h-8 w-24 rounded-control" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
