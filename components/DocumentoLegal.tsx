import type { ReactNode } from "react";
import { VERSION_LEGAL } from "@/lib/legal";

/** Marco común de las páginas legales, con el aviso de borrador visible. */
export default function DocumentoLegal({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <strong>Borrador pendiente de revisión legal.</strong> Este texto aún no ha sido validado por un abogado y puede cambiar.
      </p>
      <h1 className="mt-6 text-3xl font-semibold text-marino">{titulo}</h1>
      <p className="mt-1 text-sm text-texto-tenue">Versión {VERSION_LEGAL}</p>
      <div className="legal mt-6 space-y-4 leading-relaxed text-texto-suave [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-marino [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-marino">
        {children}
      </div>
    </main>
  );
}
