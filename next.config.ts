import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  // Database tooling, the workbook extract and the sample spreadsheet are
  // build-time only. Keeping them out of the trace makes the serverless
  // bundles smaller and the trace step cheaper.
  outputFileTracingExcludes: {
    "*": [
      "./scripts/**",
      "./samples/**",
      "./node_modules/.cache/**",
    ],
  },
};

export default nextConfig;
