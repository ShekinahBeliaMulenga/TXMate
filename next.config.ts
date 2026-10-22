
import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.*.*"],
  turbopack: {
    root: path.resolve("."),
  },
};

export default nextConfig;
