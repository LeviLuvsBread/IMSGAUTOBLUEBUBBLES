"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/cn";

type Side = "top" | "bottom" | "left" | "right";

// Position class + the centering offset (kept inside framer's transform so it
// doesn't fight the scale animation).
const SIDES: Record<Side, { cls: string; t: { x?: string; y?: string } }> = {
  top: { cls: "bottom-full left-1/2 mb-2", t: { x: "-50%" } },
  bottom: { cls: "top-full left-1/2 mt-2", t: { x: "-50%" } },
  left: { cls: "right-full top-1/2 mr-2", t: { y: "-50%" } },
  right: { cls: "left-full top-1/2 ml-2", t: { y: "-50%" } },
};

export function Tooltip({
  label,
  side = "top",
  className,
  delay = 350,
  children,
}: {
  label: React.ReactNode;
  side?: Side;
  /** Applied to the wrapper (e.g. "w-full", "absolute right-3 top-3", "md:hidden"). */
  className?: string;
  delay?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  };

  const s = SIDES[side];

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
    >
      {children}
      <AnimatePresence>
        {open ? (
          <motion.span
            role="tooltip"
            initial={{ opacity: 0, scale: 0.95, ...s.t }}
            animate={{ opacity: 1, scale: 1, ...s.t }}
            exit={{ opacity: 0, scale: 0.95, ...s.t }}
            transition={{ duration: 0.14, ease: [0, 0, 0.58, 1] }}
            className={cn(
              "pointer-events-none absolute z-[60] w-max max-w-[220px] rounded-control bg-[#1d1d1f]/95 px-2.5 py-1.5 text-caption font-medium leading-snug text-white shadow-overlay backdrop-blur dark:bg-[#2c2c2e]/95",
              s.cls,
            )}
          >
            {label}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
