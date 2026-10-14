import type { NextConfig } from "next";

// Dev-only: `next dev` blocks cross-origin requests for /_next/static, so a
// tunnelled host serves HTML that never hydrates. The host lives in .env.local
// because tunnel URLs are ephemeral and must not be committed.
const devOrigin = process.env.DEV_ORIGIN?.replace(/^https?:\/\//, "").replace(/\/$/, "");

const nextConfig: NextConfig = {
  ...(devOrigin ? { allowedDevOrigins: [devOrigin] } : {}),
};

export default nextConfig;
