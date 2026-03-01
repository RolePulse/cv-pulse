import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep @react-pdf/renderer server-side only — it has no browser-compatible build
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
