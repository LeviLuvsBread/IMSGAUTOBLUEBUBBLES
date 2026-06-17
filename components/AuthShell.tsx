// Centered card shell shared by all auth screens.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-10 w-10" />
          <div>
            <h1 className="text-title3 font-semibold leading-tight">
              iMessage Outreach
            </h1>
            <p className="text-footnote text-label-secondary">
              Private dashboard
            </p>
          </div>
        </div>
        <div className="rounded-card bg-surface p-6 shadow-card ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
          {children}
        </div>
      </div>
    </main>
  );
}
