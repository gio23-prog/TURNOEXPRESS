import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL_ACTUALIZADO } from "@/lib/operador";

/** Estructura común de los documentos legales: título, índice y secciones numeradas. */
export function DocumentoLegal({
  titulo, resumen, secciones, otro,
}: {
  titulo: string;
  resumen: ReactNode;
  secciones: { id: string; titulo: string; contenido: ReactNode }[];
  otro: { href: string; texto: string };
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 text-stone-800">
      <Link href="/" className="text-xl font-extrabold tracking-tight text-stone-900">
        Turno<span className="text-teal-700">Express</span>
      </Link>
      <p className="mt-6 text-sm text-stone-500">Última actualización: {LEGAL_ACTUALIZADO}</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-stone-900 text-balance">{titulo}</h1>
      <div className="mt-4 rounded-xl border border-stone-200 bg-white p-4 leading-relaxed">{resumen}</div>

      <nav aria-label="Índice" className="mt-6">
        <ol className="grid gap-1 text-sm sm:grid-cols-2">
          {secciones.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-teal-800 underline-offset-2 hover:underline">
                {i + 1}. {s.titulo}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-8 space-y-8">
        {secciones.map((s, i) => (
          <section key={s.id} id={s.id} className="scroll-mt-6">
            <h2 className="text-xl font-bold text-stone-900">{i + 1}. {s.titulo}</h2>
            <div className="mt-2 max-w-prose space-y-3 leading-relaxed [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">{s.contenido}</div>
          </section>
        ))}
      </div>

      <p className="mt-10 text-sm">
        Véase también: <Link href={otro.href} className="font-medium text-teal-800 underline">{otro.texto}</Link>
      </p>
    </main>
  );
}
