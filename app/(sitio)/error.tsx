"use client";

import Link from "next/link";

// Error de una página: el encabezado y el pie del sitio siguen visibles.
export default function ErrorPagina({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-sm font-medium text-turquesa-oscuro">Algo salió mal</p>
      <h1 className="mt-2 text-2xl font-semibold text-marino">No pudimos cargar esta página</h1>
      <p className="mt-2 text-texto-suave">Intenta de nuevo en unos segundos. Si el problema sigue, vuelve más tarde.</p>
      {error.digest && <p className="mt-2 text-xs text-texto-tenue">Código: {error.digest}</p>}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={() => retry()} className="rounded-lg bg-turquesa-oscuro px-5 py-3 font-medium text-white hover:bg-turquesa-hover">
          Reintentar
        </button>
        <Link href="/" className="rounded-lg border border-borde-fuerte px-5 py-3 font-medium text-marino hover:border-turquesa">Ir al inicio</Link>
      </div>
    </main>
  );
}
