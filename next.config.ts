import type { NextConfig } from "next";

const allowedOrigins = (process.env.APP_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""))
  .filter(Boolean);

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins,
      // Vinext also checks multipart route uploads against this budget.
      // Each chat batch contains at most 50 MB of files plus multipart headers.
      bodySizeLimit: "52mb",
    },
  },
};

export default nextConfig;
