import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TurnoExpress",
  description: "Turnos por horas, por día y de fin de semana en todo Chile. Publica un turno en minutos o postula a turnos cerca de ti.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-CL"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-stone-50">
        <div className="flex-1">{children}</div>
        <footer className="border-t border-stone-200 bg-white pb-24 sm:pb-0">
          <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-6 text-sm text-stone-500 sm:flex-row sm:items-center sm:justify-between">
            <span>TurnoExpress · Chile · 2026</span>
            <nav aria-label="Legal" className="flex gap-4">
              <Link href="/legal/terminos" className="hover:text-stone-800 hover:underline">Términos y Condiciones</Link>
              <Link href="/legal/privacidad" className="hover:text-stone-800 hover:underline">Privacidad</Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
