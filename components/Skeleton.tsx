import { cn } from "@/lib/cn";

/** Shimmering placeholder block. Compose freely to mirror real layouts. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden="true" />;
}
