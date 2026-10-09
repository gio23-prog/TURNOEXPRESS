import type { NextConfig } from "next";

// Cabeceras básicas de seguridad (ARQUITECTURA.md §7). La CSP queda pendiente.
const seguridad = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.github.dev"],
  headers: async () => [{ source: "/:path*", headers: seguridad }],
};

export default nextConfig;