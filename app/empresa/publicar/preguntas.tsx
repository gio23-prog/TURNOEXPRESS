"use client";

import {
  MAX_LARGO_PREGUNTA,
  MAX_PREGUNTAS,
  SUGERENCIAS_PREGUNTAS,
  opcionesDe,
  temaSensible,
  type PreguntaEmpleador,
  type TipoPregunta,
} from "@/lib/schemas/publicar";

const campo = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700";

const TIPOS: { id: TipoPregunta; nombre: string }[] = [
  { id: "si_no", nombre: "Sí / No" },
  { id: "opcion", nombre: "Elegir una opción" },
  { id: "texto", nombre: "Respuesta corta" },
];

const nueva = (p?: Partial<PreguntaEmpleador>): PreguntaEmpleador => ({
  texto: "", tipo: "si_no", opciones: "", obligatoria: true, excluyentes: [], ...p,
});

export default function EditorPreguntas({
  preguntas, onChange, errores,
}: {
  preguntas: PreguntaEmpleador[];
  onChange: (ps: PreguntaEmpleador[]) => void;
  errores: Record<string, string>;
}) {
  const cambiar = (i: number, cambios: Partial<PreguntaEmpleador>) =>
    onChange(preguntas.map((p, j) => (j === i ? { ...p, ...cambios } : p)));
  const quitar = (i: number) => onChange(preguntas.filter((_, j) => j !== i));
  const lleno = preguntas.length >= MAX_PREGUNTAS;
  const sugerencias = SUGERENCIAS_PREGUNTAS.filter((s) => !preguntas.some((p) => p.texto === s.texto));

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600">
        Opcional. Agrega hasta {MAX_PREGUNTAS} preguntas que los postulantes responderán al postular. Si marcas una respuesta
        como <strong>excluyente</strong>, quien la elija aparecerá como &ldquo;No cumple requisito&rdquo;. No se descarta
        automáticamente: tú decides. El postulante no ve cuál respuesta es excluyente.
      </p>

      {preguntas.map((p, i) => {
        const ops = opcionesDe(p);
        const sensible = temaSensible(p.texto);
        return (
          <fieldset key={i} aria-label={`Pregunta ${i + 1}`} className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-stone-800">Pregunta {i + 1}</p>
              <button type="button" onClick={() => quitar(i)} className="text-sm font-medium text-stone-600 underline">
                Quitar
              </button>
            </div>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-stone-700">Pregunta</span>
              <textarea id={`pregunta-${i}`} rows={2} className={campo} maxLength={MAX_LARGO_PREGUNTA} value={p.texto}
                onChange={(e) => cambiar(i, { texto: e.target.value })} placeholder="Ej: ¿Tienes experiencia como barista?" />
              <span className="mt-1 block text-right text-xs text-stone-500 tabular-nums">
                {p.texto.length}/{MAX_LARGO_PREGUNTA}
              </span>
            </label>

            {sensible && (
              <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                Esta pregunta parece tocar un tema de <strong>{sensible}</strong>. En Chile no se puede seleccionar personal por
                esos motivos. Reformúlala para preguntar solo por lo que exige el trabajo.
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-stone-700">Tipo de respuesta</span>
                <select id={`pregunta-${i}-tipo`} className={campo} value={p.tipo}
                  onChange={(e) => cambiar(i, { tipo: e.target.value as TipoPregunta, excluyentes: [] })}>
                  {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-stone-700">
                <input id={`pregunta-${i}-obligatoria`} type="checkbox" className="size-4" checked={p.obligatoria}
                  onChange={(e) => cambiar(i, { obligatoria: e.target.checked })} />
                Respuesta obligatoria
              </label>
            </div>

            {p.tipo === "opcion" && (
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-stone-700">Opciones (una por línea, entre 2 y 6)</span>
                <textarea id={`pregunta-${i}-opciones`} rows={3} className={campo} value={p.opciones}
                  onChange={(e) => cambiar(i, { opciones: e.target.value, excluyentes: p.excluyentes.filter((x) => opcionesDe({ opciones: e.target.value }).includes(x)) })}
                  placeholder={"Menos de 1 año\n1 a 3 años\nMás de 3 años"} />
              </label>
            )}

            {p.tipo === "si_no" && (
              <fieldset>
                <legend className="mb-1 text-sm font-medium text-stone-700">Respuesta excluyente</legend>
                <div className="flex flex-wrap gap-4 text-sm text-stone-700">
                  {[["", "Ninguna"], ["si", "Sí"], ["no", "No"]].map(([v, t]) => (
                    <label key={v} className="flex items-center gap-2">
                      <input type="radio" name={`excluyente-${i}`} checked={(p.excluyentes[0] ?? "") === v}
                        onChange={() => cambiar(i, { excluyentes: v ? [v] : [] })} />
                      {t}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {p.tipo === "opcion" && ops.length >= 2 && (
              <fieldset>
                <legend className="mb-1 text-sm font-medium text-stone-700">Respuestas excluyentes (opcional)</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-stone-700">
                  {ops.map((o) => (
                    <label key={o} className="flex items-center gap-2">
                      <input type="checkbox" className="size-4" checked={p.excluyentes.includes(o)}
                        onChange={(e) => cambiar(i, {
                          excluyentes: e.target.checked ? [...p.excluyentes, o] : p.excluyentes.filter((x) => x !== o),
                        })} />
                      {o}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {errores[`pregunta-${i}`] && <p role="alert" className="text-sm text-red-700">{errores[`pregunta-${i}`]}</p>}
          </fieldset>
        );
      })}

      {errores.preguntas && <p role="alert" className="text-sm text-red-700">{errores.preguntas}</p>}

      {!lleno && (
        <div className="space-y-3">
          <button type="button" onClick={() => onChange([...preguntas, nueva()])}
            className="w-full rounded-lg border border-dashed border-teal-700 px-4 py-3 font-medium text-teal-800 hover:bg-teal-50">
            + Agregar pregunta
          </button>
          {sugerencias.length > 0 && (
            <div>
              <p className="mb-2 text-sm text-stone-600">O agrega una sugerida:</p>
              <div className="flex flex-wrap gap-2">
                {sugerencias.map((s) => (
                  <button key={s.texto} type="button" onClick={() => onChange([...preguntas, nueva(s)])}
                    className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-left text-sm text-stone-700 hover:border-teal-700">
                    {s.texto}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
