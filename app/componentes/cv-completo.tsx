import { NOMBRE_NIVEL_FORMACION, NOMBRE_NIVEL_IDIOMA, periodoTexto } from "@/lib/schemas/cv";

export type CVCompleto = {
  bio: string | null;
  experiencias: { id: string; position: string; company: string; description: string | null; location: string | null;
    start_date: string; end_date: string | null; is_current: boolean }[];
  formacion: { id: string; institution: string; title: string | null; level: string;
    start_date: string | null; end_date: string | null; is_current: boolean }[];
  idiomas: { language: string; level: string }[];
  habilidades: string[];
  movilidad: { can_travel: boolean; can_relocate: boolean; has_vehicle: boolean };
};

const mes = (d: string | null) => (d ? d.slice(0, 7) : "");

/** CV estructurado de un postulante, solo lectura (lo ve la empresa a cuya oferta postuló). */
export function CVPostulante({ cv }: { cv: CVCompleto }) {
  const movilidad = [
    cv.movilidad.can_travel && "Disponible para viajar",
    cv.movilidad.can_relocate && "Disponible para cambiar de residencia",
    cv.movilidad.has_vehicle && "Tiene vehículo propio",
  ].filter(Boolean) as string[];
  const vacio = !cv.bio && !cv.experiencias.length && !cv.formacion.length && !cv.idiomas.length && !cv.habilidades.length;
  if (vacio) return <p className="text-sm text-stone-500">El postulante aún no completa su CV en TurnoExpress. Revisa su currículum en PDF.</p>;

  return (
    <div className="space-y-4 text-sm">
      {cv.bio && <p className="whitespace-pre-line text-stone-700">{cv.bio}</p>}
      {cv.experiencias.length > 0 && (
        <section>
          <h4 className="font-semibold text-stone-900">Experiencia</h4>
          <ul className="mt-1 space-y-2">
            {cv.experiencias.map((x) => (
              <li key={x.id}>
                <p className="font-medium">{x.position} · {x.company}</p>
                <p className="text-stone-500 first-letter:uppercase">
                  {periodoTexto(mes(x.start_date), mes(x.end_date), x.is_current)}{x.location && ` · ${x.location}`}
                </p>
                {x.description && <p className="text-stone-700">{x.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {cv.formacion.length > 0 && (
        <section>
          <h4 className="font-semibold text-stone-900">Formación</h4>
          <ul className="mt-1 space-y-1">
            {cv.formacion.map((x) => (
              <li key={x.id}>
                <span className="font-medium">{x.title || NOMBRE_NIVEL_FORMACION[x.level]}</span> · {x.institution}
                {(x.start_date || x.end_date || x.is_current) && (
                  <span className="text-stone-500"> · {periodoTexto(mes(x.start_date), mes(x.end_date), x.is_current)}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {cv.idiomas.length > 0 && (
        <p><span className="font-semibold text-stone-900">Idiomas: </span>
          {cv.idiomas.map((x) => `${x.language} (${NOMBRE_NIVEL_IDIOMA[x.level]?.toLowerCase()})`).join(", ")}</p>
      )}
      {cv.habilidades.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {cv.habilidades.map((h) => <li key={h} className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-800">{h}</li>)}
        </ul>
      )}
      {movilidad.length > 0 && <p className="text-stone-600">{movilidad.join(" · ")}</p>}
    </div>
  );
}
