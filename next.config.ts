import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.github.dev"],
  experimental: {
    serverActions: {
      // En Codespaces la página llega por *.app.github.dev pero el servidor ve localhost:3000.
      // Sin esto, Next.js rechaza los formularios ("Invalid Server Actions request").
      allowedOrigins: ["*.app.github.dev", "localhost:3000"],
    },
  },
};

export default nextConfig;
