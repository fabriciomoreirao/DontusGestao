import type { NextConfig } from "next";

const allowedOrigins = (process.env.APP_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""))
  .filter(Boolean);

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins,
    },
  },
};

export default nextConfig;
