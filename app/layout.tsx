import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Outreach — iMessage Automation",
  description: "Private single-user iMessage outreach dashboard",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Outreach",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0d" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Runs before first paint: resolves the stored/system theme and sets the class,
// so there's no flash of the wrong theme on load.
const themeScript = `(function(){try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

// Applies the saved wallpaper + dimming before first paint (no flash).
const wallpaperScript = `(function(){try{var w=localStorage.getItem('wallpaper');if(w){var r=document.documentElement;r.style.setProperty('--wallpaper-bg',w);r.style.setProperty('--wallpaper-scrim',localStorage.getItem('wallpaperScrim')||'0.42');r.dataset.wallpaper='on';}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: wallpaperScript }} />
        <div className="app-wallpaper" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
