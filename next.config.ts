import type { NextConfig } from "next";

const isCapacitor = process.env.CAPACITOR_BUILD === "1";

const nextConfig: NextConfig = {
  output: isCapacitor ? "export" : undefined, // ✅ export only for Android build
  images: { unoptimized: true },              // usually needed for export
};

export default nextConfig;
