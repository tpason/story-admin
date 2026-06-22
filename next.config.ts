import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  experimental: { cpus: 1 }
};

export default nextConfig;
