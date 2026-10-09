"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import {
  PREGUNTAS_MODALIDAD,
  PREGUNTA_REEMPLAZO,
  calcularDuracion,
  calcularPago,
  nivelRiesgo,
  validarPaso,
  validarTodo,
  type Borrador,
} from "@/lib/schemas/publicar";
import { publicarTurno } from "./actions";
import { AVISO_MEDIO, COMPROMISO_PUBLICAR } from "@/lib/legal";

const PASOS = ["Qué", "Cuándo y dónde", "Pago y condiciones", "Modalidad", "Vista previa"];

const inicial: Borrador = {
  categoria: "", titulo: "", descripcion: "", cupos: "1",
  fecha: "", inicio: "09:00", termino: "17:00", comuna: "", direccion: "", urgente: false,
  modoPago: "total", monto: "", pausas: "", vestimenta: "", alimentacion: false, transporte: false,
  respuestas: {}, confirmaAdvertencia: false, aceptaCompromiso: false,
};

const clp = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

const input =
  "w-full rounded-lg border border-borde-fuerte bg-white px-3 py-2 text-marino focus:outline-none focus:ring-2 focus:ring-turquesa";

function Campo({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-texto-suave">{label}</span>
      {children}
      {error && <span role="alert" className="mt-1 block text-sm text-red-700">{error}</span>}
    </label>
  );
}

function SiNo({ valor, onChange }: { valor?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="mt-2 flex gap-2" role="radiogroup">
      {[true, false].map((v) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={valor === v}
          onClick={() => onChange(v)}
          className={`min-w-16 rounded-lg border px-4 py-2 text-sm font-medium ${
            valor === v ? "border-turquesa-oscuro bg-turquesa-oscuro text-white" : "border-borde-fuerte bg-white text-texto-suave"
          }`}
        >
          {v ? "Sí" : "No"}
        </button>
      ))}
    </div>
  );
}

export type Categoria = { grupo: string; opciones: { id: string; nombre: string; nota?: string }[] };
export type Comuna = { id: string; nombre: string };

export default function Formulario({ categorias, comunas }: { categorias: Categoria[]; comunas: Comuna[] }) {
  const [paso, setPaso] = useState(0);
  const [d, setD] = useState<Borrador>(inicial);
  // Si publicar falla después de guardar el borrador, se reintenta sobre el mismo.
  const [borradorId, setBorradorId] = useState<string | undefined>();
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setD((p) => ({ ...p, [k]: v }));
  const mins = calcularDuracion(d.inicio, d.termino);
  const pago = calcularPago(d);
  const riesgo = nivelRiesgo(d.respuestas);
  const subcategoria = categorias.flatMap((c) => c.opciones).find((o) => o.id === d.categoria);
  const comuna = comunas.find((c) => c.id === d.comuna);

  function siguiente() {
    const e = validarPaso(paso, d);
    setErr(e);
    if (Object.keys(e).length === 0) setPaso((p) => p + 1);
  }

  function publicar() {
    const e = validarTodo(d);
    if (e.confirmaAdvertencia || e.aceptaCompromiso) {
      setErr(e);
      return;
    }
    iniciar(async () => {
      const r = await publicarTurno(d, borradorId);
      if (r.borradorId) setBorradorId(r.borradorId);
      if (r.errores) setErr(r.errores);
      setMsg({ ok: r.ok, texto: r.mensaje });
    });
  }

  if (msg?.ok) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-semibold text-marino">Turno enviado</h1>
        <p className="mt-2 text-texto-suave">{msg.texto}</p>
        <button
          type="button"
          onClick={() => { setD(inicial); setBorradorId(undefined); setErr({}); setMsg(null); setPaso(0); }}
          className="mt-6 inline-block font-medium text-turquesa-oscuro underline"
        >
          Publicar otro turno
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-4 sm:px-6 sm:pt-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-marino">Publicar un turno</h1>
        <p className="mt-1 text-sm text-texto-suave">Paso {paso + 1} de {PASOS.length}: {PASOS[paso]}</p>
        <div className="mt-3 h-1.5 rounded-full bg-borde" aria-hidden>
          <div className="h-full rounded-full bg-turquesa transition-all" style={{ width: `${((paso + 1) / PASOS.length) * 100}%` }} />
        </div>
      </header>

      <div className="space-y-4">
        {paso === 0 && (
          <>
            <Campo label="Categoría" error={err.categoria}>
              <select className={input} value={d.categoria} onChange={(e) => set("categoria", e.target.value)}>
                <option value="">Elige una categoría</option>
                {categorias.map((c) => (
                  <optgroup key={c.grupo} label={c.grupo}>
                    {c.opciones.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                  </optgroup>
                ))}
              </select>
            </Campo>
            {subcategoria?.nota && (
              <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{subcategoria.nota}</p>
            )}
            <Campo label="Título" error={err.titulo}>
              <input className={input} value={d.titulo} maxLength={80} onChange={(e) => set("titulo", e.target.value)} placeholder="Ej: Garzón para turno de almuerzo" />
            </Campo>
            <Campo label="Descripción" error={err.descripcion}>
              <textarea className={input} rows={4} value={d.descripcion} maxLength={1000} onChange={(e) => set("descripcion", e.target.value)} placeholder="Qué tareas debe hacer y qué experiencia necesita" />
            </Campo>
            <Campo label="Cupos" error={err.cupos}>
              <input className={input} type="number" min={1} max={20} inputMode="numeric" value={d.cupos} onChange={(e) => set("cupos", e.target.value)} />
            </Campo>
          </>
        )}

        {paso === 1 && (
          <>
            <Campo label="Fecha" error={err.fecha}>
              <input className={input} type="date" value={d.fecha} onChange={(e) => set("fecha", e.target.value)} />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Inicio" error={err.inicio}>
                <input className={input} type="time" value={d.inicio} onChange={(e) => set("inicio", e.target.value)} />
              </Campo>
              <Campo label="Término" error={err.termino}>
                <input className={input} type="time" value={d.termino} onChange={(e) => set("termino", e.target.value)} />
              </Campo>
            </div>
            <p className="text-sm text-texto-suave">Duración: {Math.floor(mins / 60)} h {mins % 60} min</p>
            <Campo label="Comuna" error={err.comuna}>
              <select className={input} value={d.comuna} onChange={(e) => set("comuna", e.target.value)}>
                <option value="">Elige una comuna</option>
                {comunas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Campo>
            <Campo label="Dirección exacta (no se publica; solo la verá quien tú decidas contactar)" error={err.direccion}>
              <input className={input} value={d.direccion} onChange={(e) => set("direccion", e.target.value)} />
            </Campo>
            <label className="flex items-center gap-2 text-sm text-texto-suave">
              <input type="checkbox" checked={d.urgente} onChange={(e) => set("urgente", e.target.checked)} />
              Es urgente (necesito confirmar hoy)
            </label>
          </>
        )}

        {paso === 2 && (
          <>
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-texto-suave">¿Cómo quieres indicar el pago?</legend>
              <div className="flex gap-4 text-sm text-texto-suave">
                <label className="flex items-center gap-2"><input type="radio" checked={d.modoPago === "total"} onChange={() => set("modoPago", "total")} /> Monto total</label>
                <label className="flex items-center gap-2"><input type="radio" checked={d.modoPago === "hora"} onChange={() => set("modoPago", "hora")} /> Valor por hora</label>
              </div>
            </fieldset>
            <Campo label={d.modoPago === "total" ? "Monto total (CLP)" : "Valor por hora (CLP)"} error={err.monto}>
              <input className={input} type="number" inputMode="numeric" min={0} value={d.monto} onChange={(e) => set("monto", e.target.value)} />
            </Campo>
            {pago.total > 0 && (
              <p className="rounded-lg bg-turquesa-claro p-3 text-sm text-turquesa-oscuro">
                Total estimado {clp(pago.total)} y {clp(pago.valorHora)} por hora, en {Math.floor(mins / 60)} h {mins % 60} min.
              </p>
            )}
            <Campo label="Pausas (opcional)" error={err.pausas}>
              <input className={input} value={d.pausas} onChange={(e) => set("pausas", e.target.value)} placeholder="Ej: 30 minutos de colación" />
            </Campo>
            <Campo label="Vestimenta (opcional)" error={err.vestimenta}>
              <input className={input} value={d.vestimenta} onChange={(e) => set("vestimenta", e.target.value)} placeholder="Ej: pantalón negro y zapatos cerrados" />
            </Campo>
            <label className="flex items-center gap-2 text-sm text-texto-suave">
              <input type="checkbox" checked={d.alimentacion} onChange={(e) => set("alimentacion", e.target.checked)} /> Incluye alimentación
            </label>
            <label className="flex items-center gap-2 text-sm text-texto-suave">
              <input type="checkbox" checked={d.transporte} onChange={(e) => set("transporte", e.target.checked)} /> Incluye transporte
            </label>
          </>
        )}

        {paso === 3 && (
          <>
            <p className="text-sm text-texto-suave">
              Estas preguntas nos ayudan a evaluar si el trabajo se parece más a un servicio independiente o a una relación laboral.
            </p>
            {PREGUNTAS_MODALIDAD.map((p) => (
              <div key={p.id} className="rounded-lg border border-borde bg-white p-3">
                <p className="text-marino">{p.texto}</p>
                <SiNo valor={d.respuestas[p.id]} onChange={(v) => set("respuestas", { ...d.respuestas, [p.id]: v })} />
                {err[p.id] && <p role="alert" className="mt-1 text-sm text-red-700">{err[p.id]}</p>}
              </div>
            ))}
            <div className="rounded-lg border border-borde bg-white p-3">
              <p className="text-marino">{PREGUNTA_REEMPLAZO.texto}</p>
              <SiNo
                valor={d.respuestas[PREGUNTA_REEMPLAZO.id]}
                onChange={(v) => set("respuestas", { ...d.respuestas, [PREGUNTA_REEMPLAZO.id]: v })}
              />
              {err[PREGUNTA_REEMPLAZO.id] && <p role="alert" className="mt-1 text-sm text-red-700">{err[PREGUNTA_REEMPLAZO.id]}</p>}
              {d.respuestas[PREGUNTA_REEMPLAZO.id] && (
                <p className="mt-2 text-sm text-amber-900">
                  Cubrir a personal ausente con trabajadores de terceros es una actividad regulada en Chile (Empresas de
                  Servicios Transitorios). Si la persona trabajará bajo tus instrucciones, revisa la guía de modalidad.
                </p>
              )}
            </div>
          </>
        )}

        {paso === 4 && (
          <>
            <dl className="divide-y divide-borde rounded-lg border border-borde bg-white text-sm">
              {[
                ["Título", d.titulo],
                ["Categoría", subcategoria?.nombre ?? ""],
                ["Cupos", d.cupos],
                ["Fecha", d.fecha],
                ["Horario", `${d.inicio} a ${d.termino} (${Math.floor(mins / 60)} h ${mins % 60} min)`],
                ["Comuna", comuna?.nombre ?? ""],
                ["Pago", `${clp(pago.total)} total, ${clp(pago.valorHora)} por hora`],
                ["Condiciones", [d.alimentacion && "alimentación", d.transporte && "transporte"].filter(Boolean).join(" y ") || "Sin extras"],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-4 p-3">
                  <dt className="text-texto-suave">{k}</dt>
                  <dd className="text-right font-medium text-marino">{v}</dd>
                </div>
              ))}
            </dl>
            {riesgo !== "bajo" ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-medium">
                  {riesgo === "alto" ? "Este turno tiene varios indicios de relación laboral." : "Este turno tiene algunos indicios de relación laboral."}
                </p>
                <p className="mt-1">
                  {riesgo === "alto" && "Quedará en revisión antes de ser visible. "}
                  Si en la práctica es una relación laboral, corresponde contrato de trabajo y no boleta de honorarios. Esta orientación no es asesoría legal.
                </p>
                <label className="mt-3 flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={d.confirmaAdvertencia} onChange={(e) => set("confirmaAdvertencia", e.target.checked)} />
                  Leí la advertencia y quiero continuar
                </label>
                {err.confirmaAdvertencia && <p role="alert" className="mt-1 text-red-700">{err.confirmaAdvertencia}</p>}
              </div>
            ) : (
              <p className="text-sm text-texto-suave">Riesgo de modalidad {riesgo}. El resultado final lo confirma el sistema al publicar.</p>
            )}
            <fieldset className="rounded-lg border border-borde bg-fondo-suave p-3 text-sm text-texto-suave">
              <legend className="px-1 font-medium text-marino">Antes de publicar</legend>
              <p>{AVISO_MEDIO}</p>
              <ul className="mt-2 space-y-1">
                {COMPROMISO_PUBLICAR.map((c) => <li key={c} className="ml-5 list-disc">{c}</li>)}
              </ul>
              <label className="mt-3 flex items-start gap-2 text-marino">
                <input type="checkbox" className="mt-1" checked={d.aceptaCompromiso} onChange={(e) => set("aceptaCompromiso", e.target.checked)} />
                <span>
                  Acepto estos compromisos y los{" "}
                  <Link href="/terminos" target="_blank" className="font-medium text-turquesa-oscuro underline">términos de uso</Link>.
                </span>
              </label>
              {err.aceptaCompromiso && <p role="alert" className="mt-1 text-red-700">{err.aceptaCompromiso}</p>}
            </fieldset>
            {msg && !msg.ok && <p role="alert" className="text-sm text-red-700">{msg.texto}</p>}
          </>
        )}
      </div>

      {/* sticky: queda pegada abajo al desplazarse, pero no tapa el pie de página */}
      <div className="sticky bottom-0 -mx-4 mt-6 border-t border-borde bg-white/95 p-3 backdrop-blur sm:-mx-6">
        <div className="mx-auto flex max-w-xl gap-3">
          {paso > 0 && (
            <button type="button" onClick={() => { setErr({}); setPaso((p) => p - 1); }} className="rounded-lg border border-borde-fuerte px-4 py-3 font-medium text-texto-suave">
              Atrás
            </button>
          )}
          {paso < PASOS.length - 1 ? (
            <button type="button" onClick={siguiente} className="flex-1 rounded-lg bg-turquesa-oscuro px-4 py-3 font-medium text-white hover:bg-turquesa-hover">
              Continuar
            </button>
          ) : (
            <button type="button" onClick={publicar} disabled={pendiente} className="flex-1 rounded-lg bg-turquesa-oscuro px-4 py-3 font-medium text-white hover:bg-turquesa-hover disabled:opacity-60">
              {pendiente ? "Publicando..." : "Publicar turno"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
