import type { NextConfig } from "next";

const isCapacitor = process.env.CAPACITOR_BUILD === "1";

const nextConfig: NextConfig = {
  output: isCapacitor ? "export" : undefined,
  images: { unoptimized: true },

  // 🔥 ADD THIS
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;