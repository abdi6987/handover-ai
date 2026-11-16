import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (Cloud Run).
  output: "standalone",
  serverExternalPackages: ["pg", "heic-convert", "@google-cloud/storage"],
};

export default nextConfig;
