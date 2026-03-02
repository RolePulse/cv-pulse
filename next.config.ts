import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep these packages server-side only — they have no browser-compatible build
  // pdf-parse: prevent Next.js from bundling it — the bundled version fails to load
  // because pdf-parse's debug entry reads a test PDF via fs.readFileSync at module init.
  // Marking it external forces a real require() at runtime which works fine on Node.
  serverExternalPackages: ["@react-pdf/renderer", "pdf-parse"],
};

export default nextConfig;
