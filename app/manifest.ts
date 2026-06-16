import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "iMessage Outreach",
    short_name: "Outreach",
    description: "Private single-user iMessage outreach dashboard",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0b93f6",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
