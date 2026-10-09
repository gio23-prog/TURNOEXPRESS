import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Turnoexpress — Trabajo temporal, oportunidades reales", template: "%s · Turnoexpress" },
  description: "Turnos por horas en la Región Metropolitana: publica un turno o encuentra trabajo para hoy.",
  applicationName: "Turnoexpress",
  // app/favicon.ico se enlaza solo; estos agregan PNG nítido y el ícono de iPhone.
  icons: {
    icon: [{ url: "/logo/icon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/logo/icon-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = { themeColor: "#0F172A" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-CL"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
