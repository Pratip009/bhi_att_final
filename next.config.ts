import type { NextConfig } from "next";

const config: NextConfig = {
  // Signatures are sent as PNG images inside server actions.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  poweredByHeader: false,
};
export default config;
