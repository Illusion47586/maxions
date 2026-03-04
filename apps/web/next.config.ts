import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@maxions/ui", "@maxions/db"],
};

export default nextConfig;
