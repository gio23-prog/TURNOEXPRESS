import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Turnoexpress",
    short_name: "Turnoexpress",
    description: "Trabajo temporal, oportunidades reales",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#0F172A",
    icons: [
      { src: "/logo/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/logo/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
