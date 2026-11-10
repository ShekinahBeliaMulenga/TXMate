import type { NextConfig } from "next";
import path from "node:path";

/**
 * Headers that are safe for every page and need no per-page work. A Content-Security-Policy is deliberately not here:
 * it has to list every script, frame and connection the app uses (Firebase, OneSignal, Google sign-in, R2 images),
 * so it should be added and tested on its own, in report-only mode first.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.*.*"],
  turbopack: {
    root: path.resolve("."),
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
