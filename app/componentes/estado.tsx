import { avance, nombreEstado, PASOS, tonoEstado, type Tono } from "@/lib/estados";
import { haceTiempo } from "@/lib/formato";

const COLORES: Record<Tono, string> = {
  nuevo: "bg-sky-100 text-sky-900",
  proceso: "bg-teal-100 text-teal-900",
  exito: "bg-emerald-100 text-emerald-900",
  cerrado: "bg-stone-200 text-stone-700",
};

export function PildoraEstado({ estado, para }: { estado: string; para: "trabajador" | "empresa" }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${COLORES[tonoEstado(estado)]}`}>
      {nombreEstado(estado, para)}
    </span>
  );
}

/** Círculo de avance dividido en tramos, uno por paso del camino normal. */
export function AnilloAvance({ estado, tamano = 56 }: { estado: string; tamano?: number }) {
  const i = avance(estado);
  const total = PASOS.length;
  const r = 22;
  const c = 2 * Math.PI * r;
  const tramo = c / total;
  const hueco = 4;
  const cerrado = i < 0;
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 56 56" role="img"
      aria-label={cerrado ? "Postulación cerrada" : `Paso ${i + 1} de ${total}`} className="shrink-0 -rotate-90">
      {PASOS.map((p, k) => (
        <circle key={p.estado} cx="28" cy="28" r={r} fill="none" strokeWidth="6" strokeLinecap="butt"
          className={!cerrado && k <= i ? "stroke-teal-700" : "stroke-stone-200"}
          strokeDasharray={`${tramo - hueco} ${c - tramo + hueco}`}
          strokeDashoffset={-k * tramo} />
      ))}
    </svg>
  );
}

/** Línea de estado vertical: muestra el camino normal y marca hasta dónde llegó la postulación. */
export function LineaEstado({ estado, desde, actualizado }: { estado: string; desde: string; actualizado: string }) {
  const i = avance(estado);
  if (i < 0) {
    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
        <PildoraEstado estado={estado} para="trabajador" />
        <p className="mt-2 text-sm text-stone-600">
          {estado === "rechazada"
            ? "Esta vez la empresa siguió con otras personas o cerró la oferta. ¡Sigue postulando!"
            : "Retiraste esta postulación. La empresa ya no ve tu contacto ni tu currículum."}
        </p>
        <p className="mt-1 text-xs text-stone-500">{haceTiempo(actualizado)}</p>
      </div>
    );
  }
  return (
    <ol className="relative">
      {PASOS.map((p, k) => {
        const hecho = k <= i;
        const actual = k === i;
        return (
          <li key={p.estado} className="relative flex gap-3 pb-5 last:pb-0">
            {k < PASOS.length - 1 && (
              <span aria-hidden className={`absolute left-[11px] top-6 h-full w-0.5 ${k < i ? "bg-teal-700" : "bg-stone-200"}`} />
            )}
            <span aria-hidden
              className={`relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                hecho ? "bg-teal-700 text-white" : "border-2 border-stone-300 bg-white text-stone-400"}`}>
              {hecho ? "✓" : ""}
            </span>
            <div className="min-w-0">
              <p className={`font-semibold ${actual ? "text-teal-900" : hecho ? "text-stone-800" : "text-stone-400"}`}>
                {p.trabajador}
                {k === 0 && <span className="ml-2 text-sm font-normal text-stone-500">{haceTiempo(desde)}</span>}
                {actual && k > 0 && <span className="ml-2 text-sm font-normal text-stone-500">{haceTiempo(actualizado)}</span>}
              </p>
              {actual && <p className="text-sm text-stone-600">{p.ayuda}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
