import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Webhook/cron routes talk to an external BlueBubbles server over a tunnel.
  // Nothing special needed here; secrets are read from env at runtime.
};

export default nextConfig;
