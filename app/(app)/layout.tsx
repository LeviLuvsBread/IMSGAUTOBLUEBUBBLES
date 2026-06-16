import Link from "next/link";
import { Nav } from "@/components/Nav";
import { HealthBadge } from "@/components/HealthBadge";
import { signOut } from "./actions";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
        <div className="flex items-center justify-between px-4 py-2">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-6 w-6" />
            <span className="font-semibold">Outreach</span>
          </Link>
          <div className="flex items-center gap-3">
            <HealthBadge />
            <form action={signOut}>
              <button className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <Nav />
      </header>
      <main className="flex-1 p-4 safe-bottom">{children}</main>
    </div>
  );
}
