import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NODE_ENV === "development" ? ".next" : ".next-production",
  poweredByHeader: false,
  allowedDevOrigins: ["*.vercel.run"],
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
};

export default nextConfig;
