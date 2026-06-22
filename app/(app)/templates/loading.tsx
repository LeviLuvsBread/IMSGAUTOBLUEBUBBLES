import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-16 rounded" />
          <Skeleton className="h-8 w-40 rounded-lg" />
        </div>
        <Skeleton className="h-9 w-32 rounded-control" />
      </div>
      <div className="max-w-xl space-y-2">
        <Skeleton className="h-10 rounded-control" />
        <Skeleton className="h-32 rounded-card" />
        <Skeleton className="h-9 w-32 rounded-control" />
      </div>
      <div className="space-y-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-row" />
        ))}
      </div>
    </div>
  );
}
