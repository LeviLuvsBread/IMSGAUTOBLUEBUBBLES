"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { WALLPAPERS } from "@/lib/wallpapers";
import { cn } from "@/lib/cn";

function applyWallpaper(css: string | null, scrim: number) {
  const r = document.documentElement;
  if (css) {
    r.style.setProperty("--wallpaper-bg", css);
    r.style.setProperty("--wallpaper-scrim", String(scrim));
    r.dataset.wallpaper = "on";
    localStorage.setItem("wallpaper", css);
    localStorage.setItem("wallpaperScrim", String(scrim));
  } else {
    r.style.removeProperty("--wallpaper-bg");
    r.style.removeProperty("--wallpaper-scrim");
    delete r.dataset.wallpaper;
    localStorage.removeItem("wallpaper");
    localStorage.removeItem("wallpaperScrim");
  }
}

export function WallpaperPicker() {
  const [selected, setSelected] = useState<string | null>(null);
  const [scrim, setScrim] = useState(0.42);

  useEffect(() => {
    try {
      setSelected(localStorage.getItem("wallpaper"));
      const s = Number(localStorage.getItem("wallpaperScrim"));
      if (Number.isFinite(s) && s > 0) setScrim(s);
    } catch {
      /* ignore */
    }
  }, []);

  const choose = (css: string | null) => {
    setSelected(css);
    applyWallpaper(css, scrim);
  };
  const changeScrim = (v: number) => {
    setScrim(v);
    if (selected) applyWallpaper(selected, v);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        <button
          type="button"
          onClick={() => choose(null)}
          title="None"
          className={cn(
            "relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-card ring-1 transition-all",
            !selected ? "ring-2 ring-accent" : "ring-hairline",
          )}
          style={{ background: "rgb(var(--canvas))" }}
        >
          <span className="text-caption2 text-label-secondary">None</span>
          {!selected ? (
            <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white">
              <Check className="h-3 w-3" />
            </span>
          ) : null}
        </button>

        {WALLPAPERS.map((w) => {
          const on = selected === w.css;
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => choose(w.css)}
              title={w.name}
              className={cn(
                "relative aspect-[3/4] overflow-hidden rounded-card ring-1 transition-all",
                on ? "ring-2 ring-accent" : "ring-black/10 dark:ring-white/10",
              )}
              style={{ backgroundImage: w.css, backgroundSize: "cover", backgroundPosition: "center" }}
            >
              {on ? (
                <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white">
                  <Check className="h-3 w-3" />
                </span>
              ) : null}
              <span className="absolute inset-x-0 bottom-0 bg-black/30 px-1 py-0.5 text-center text-caption2 font-medium text-white">
                {w.name}
              </span>
            </button>
          );
        })}
      </div>

      <div>
        <label className="mb-1 block text-footnote font-medium text-label-secondary">
          Background dimming — raise it if anything's hard to read
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={70}
            value={Math.round(scrim * 100)}
            onChange={(e) => changeScrim(Number(e.target.value) / 100)}
            disabled={!selected}
            className="h-1.5 flex-1 accent-accent disabled:opacity-40"
          />
          <span className="w-10 text-right text-caption text-label-secondary tabular-nums">
            {Math.round(scrim * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}
