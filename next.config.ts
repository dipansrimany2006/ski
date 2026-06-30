import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for @opennextjs/cloudflare
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

// Enables getCloudflareContext() (D1, env bindings) when running `next dev`.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
