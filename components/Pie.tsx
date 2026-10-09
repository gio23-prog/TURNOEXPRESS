import Link from "next/link";
import { AVISO_MEDIO } from "@/lib/legal";

const ENLACES = [
  { href: "/terminos", texto: "Términos de uso" },
  { href: "/privacidad", texto: "Privacidad" },
  { href: "/aviso-legal", texto: "Aviso legal" },
];

export default function Pie() {
  return (
    <footer className="mt-auto border-t border-borde bg-fondo-suave">
      <div className="mx-auto max-w-5xl px-4 py-8 text-sm">
        <nav aria-label="Legal" className="flex flex-wrap gap-x-6 gap-y-2">
          {ENLACES.map((e) => (
            <Link key={e.href} href={e.href} className="font-medium text-texto-suave hover:text-marino hover:underline">
              {e.texto}
            </Link>
          ))}
        </nav>
        <p className="mt-4 max-w-3xl text-texto-tenue">{AVISO_MEDIO}</p>
        <p className="mt-2 text-texto-tenue">© {new Date().getFullYear()} Turnoexpress · Trabajo temporal, oportunidades reales</p>
      </div>
    </footer>
  );
}
