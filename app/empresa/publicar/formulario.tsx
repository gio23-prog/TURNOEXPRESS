"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import {
  PREGUNTAS_MODALIDAD,
  calcularDuracion,
  calcularPago,
  nivelRiesgo,
  requiereAviso,
  validarPaso,
  type Borrador,
  type Categoria,
  type Comuna,
  type Region,
} from "@/lib/schemas/publicar";
import { publicarTurno } from "./actions";

const PASOS = ["Qué", "Cuándo y dónde", "Pago y condiciones", "Modalidad", "Vista previa"];

const inicial: Borrador = {
  categoria: "", titulo: "", descripcion: "", cupos: "1",
  fecha: "", inicio: "09:00", termino: "17:00", region: "", comuna: "", direccion: "", urgente: false,
  modoPago: "total", monto: "", pausas: "", vestimenta: "", alimentacion: false, transporte: false,
  respuestas: {}, confirmaAdvertencia: false,
};

const clp = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

const input =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700";

function Campo({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-700">{label}</span>
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
            valor === v ? "border-teal-700 bg-teal-700 text-white" : "border-stone-300 bg-white text-stone-700"
          }`}
        >
          {v ? "Sí" : "No"}
        </button>
      ))}
    </div>
  );
}

export default function FormularioPublicar({
  categorias,
  regiones,
  comunas,
}: {
  categorias: Categoria[];
  regiones: Region[];
  comunas: Comuna[];
}) {
  const [paso, setPaso] = useState(0);
  const [d, setD] = useState<Borrador>(inicial);
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; texto: string; estado?: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setD((p) => ({ ...p, [k]: v }));
  const mins = calcularDuracion(d.inicio, d.termino);
  const pago = calcularPago(d);
  const riesgo = nivelRiesgo(d.respuestas);
  const aviso = requiereAviso(d.respuestas);
  const nombreCategoria = categorias.flatMap((c) => c.subcategorias.map((s) => ({ ...s, padre: c.nombre })))
    .find((s) => String(s.id) === d.categoria);
  const nombreComuna = comunas.find((c) => String(c.id) === d.comuna)?.nombre ?? "";
  const nombreRegion = regiones.find((r) => String(r.id) === d.region)?.nombre ?? "";
  const comunasRegion = comunas.filter((c) => String(c.regionId) === d.region);
  const fechaTxt = d.fecha ? d.fecha.split("-").reverse().join("/") : "";

  function siguiente() {
    const e = validarPaso(paso, d);
    setErr(e);
    if (Object.keys(e).length === 0) setPaso((p) => p + 1);
  }

  function publicar() {
    if (aviso && !d.confirmaAdvertencia) {
      setErr({ confirmaAdvertencia: "Confirma que leíste la advertencia" });
      return;
    }
    iniciar(async () => {
      const r = await publicarTurno(d);
      if (r.errores) setErr(r.errores);
      setMsg({ ok: r.ok, texto: r.mensaje, estado: r.estado });
    });
  }

  if (msg?.ok) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-semibold text-stone-900">
          {msg.estado === "en_revision" ? "Turno en revisión" : "Turno publicado"}
        </h1>
        <p className="mt-2 text-stone-700">{msg.texto}</p>
        <Link href="/empresa/publicar" onClick={() => { setMsg(null); setD(inicial); setPaso(0); }} className="mt-6 inline-block font-medium text-teal-800 underline">
          Publicar otro turno
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl bg-stone-50 p-4 pb-24 sm:p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-stone-900">Publicar un turno</h1>
        <p className="mt-1 text-sm text-stone-600">Paso {paso + 1} de {PASOS.length}: {PASOS[paso]}</p>
        <div className="mt-3 h-1.5 rounded-full bg-stone-200" aria-hidden>
          <div className="h-full rounded-full bg-teal-700 transition-all" style={{ width: `${((paso + 1) / PASOS.length) * 100}%` }} />
        </div>
      </header>

      <div className="space-y-4">
        {paso === 0 && (
          <>
            <Campo label="Categoría" error={err.categoria}>
              <select className={input} value={d.categoria} onChange={(e) => set("categoria", e.target.value)}>
                <option value="">Elige una categoría</option>
                {categorias.map((c) => (
                  <optgroup key={c.id} label={c.nombre}>
                    {c.subcategorias.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </optgroup>
                ))}
              </select>
            </Campo>
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
            <p className="text-sm text-stone-600">
              Duración: {Math.floor(mins / 60)} h {mins % 60} min{d.termino <= d.inicio && mins > 0 ? " (termina al día siguiente)" : ""}
            </p>
            <Campo label="Región" error={err.region}>
              <select
                className={input}
                value={d.region}
                onChange={(e) => setD((p) => ({ ...p, region: e.target.value, comuna: "" }))}
              >
                <option value="">Elige una región</option>
                {regiones.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>
            </Campo>
            <Campo label="Comuna" error={err.comuna}>
              <select className={input} value={d.comuna} disabled={!d.region} onChange={(e) => set("comuna", e.target.value)}>
                <option value="">{d.region ? "Elige una comuna" : "Primero elige una región"}</option>
                {comunasRegion.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Campo>
            <Campo label="Dirección exacta (solo la verá quien sea contratado)" error={err.direccion}>
              <input className={input} value={d.direccion} onChange={(e) => set("direccion", e.target.value)} />
            </Campo>
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" checked={d.urgente} onChange={(e) => set("urgente", e.target.checked)} />
              Es urgente (necesito confirmar hoy)
            </label>
          </>
        )}

        {paso === 2 && (
          <>
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-stone-700">¿Cómo quieres indicar el pago?</legend>
              <div className="flex gap-4 text-sm text-stone-700">
                <label className="flex items-center gap-2"><input type="radio" checked={d.modoPago === "total"} onChange={() => set("modoPago", "total")} /> Monto total</label>
                <label className="flex items-center gap-2"><input type="radio" checked={d.modoPago === "hora"} onChange={() => set("modoPago", "hora")} /> Valor por hora</label>
              </div>
            </fieldset>
            <Campo label={d.modoPago === "total" ? "Monto total (CLP)" : "Valor por hora (CLP)"} error={err.monto}>
              <input className={input} type="number" inputMode="numeric" min={0} value={d.monto} onChange={(e) => set("monto", e.target.value)} />
            </Campo>
            {pago.total > 0 && (
              <p className="rounded-lg bg-teal-50 p-3 text-sm text-teal-900">
                Total estimado {clp(pago.total)} y {clp(pago.valorHora)} por hora, en {Math.floor(mins / 60)} h {mins % 60} min.
              </p>
            )}
            <Campo label="Pausas (opcional)" error={err.pausas}>
              <input className={input} value={d.pausas} onChange={(e) => set("pausas", e.target.value)} placeholder="Ej: 30 minutos de colación" />
            </Campo>
            <Campo label="Vestimenta (opcional)" error={err.vestimenta}>
              <input className={input} value={d.vestimenta} onChange={(e) => set("vestimenta", e.target.value)} placeholder="Ej: pantalón negro y zapatos cerrados" />
            </Campo>
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" checked={d.alimentacion} onChange={(e) => set("alimentacion", e.target.checked)} /> Incluye alimentación
            </label>
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" checked={d.transporte} onChange={(e) => set("transporte", e.target.checked)} /> Incluye transporte
            </label>
          </>
        )}

        {paso === 3 && (
          <>
            <p className="text-sm text-stone-600">
              Estas preguntas nos ayudan a evaluar si el trabajo se parece más a un servicio independiente o a una relación laboral.
            </p>
            {PREGUNTAS_MODALIDAD.map((p) => (
              <div key={p.id} className="rounded-lg border border-stone-200 bg-white p-3">
                <p className="text-stone-900">{p.texto}</p>
                <SiNo valor={d.respuestas[p.id]} onChange={(v) => set("respuestas", { ...d.respuestas, [p.id]: v })} />
                {err[p.id] && <p role="alert" className="mt-1 text-sm text-red-700">{err[p.id]}</p>}
              </div>
            ))}
          </>
        )}

        {paso === 4 && (
          <>
            <dl className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white text-sm">
              {[
                ["Título", d.titulo],
                ["Categoría", nombreCategoria ? `${nombreCategoria.padre} · ${nombreCategoria.nombre}` : ""],
                ["Cupos", d.cupos],
                ["Fecha", fechaTxt],
                ["Horario", `${d.inicio} a ${d.termino} (${Math.floor(mins / 60)} h ${mins % 60} min)`],
                ["Ubicación", nombreComuna ? `${nombreComuna}, ${nombreRegion}` : ""],
                ["Pago", `${clp(pago.total)} total, ${clp(pago.valorHora)} por hora`],
                ["Condiciones", [d.alimentacion && "alimentación", d.transporte && "transporte"].filter(Boolean).join(" y ") || "Sin extras"],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-4 p-3">
                  <dt className="text-stone-600">{k}</dt>
                  <dd className="text-right font-medium text-stone-900">{v}</dd>
                </div>
              ))}
            </dl>
            {aviso ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-medium">
                  {riesgo === "alto" ? "Este turno tiene varios indicios de relación laboral." : "Este turno tiene algunos indicios de relación laboral."}
                </p>
                <p className="mt-1">
                  {riesgo === "alto"
                    ? "Quedará en revisión antes de ser visible. "
                    : ""}
                  Si en la práctica hay subordinación y dependencia, puede corresponder un contrato de trabajo y no una boleta de honorarios.
                </p>
                <label className="mt-3 flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={d.confirmaAdvertencia} onChange={(e) => set("confirmaAdvertencia", e.target.checked)} />
                  Leí la advertencia y quiero continuar
                </label>
                {err.confirmaAdvertencia && <p role="alert" className="mt-1 text-red-700">{err.confirmaAdvertencia}</p>}
              </div>
            ) : (
              <p className="text-sm text-stone-600">Riesgo de modalidad {riesgo}. El resultado final lo confirma el sistema al publicar.</p>
            )}
            {msg && !msg.ok && <p role="alert" className="text-sm text-red-700">{msg.texto}</p>}
          </>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl gap-3">
          {paso > 0 && (
            <button type="button" onClick={() => { setErr({}); setPaso((p) => p - 1); }} className="rounded-lg border border-stone-300 px-4 py-3 font-medium text-stone-700">
              Atrás
            </button>
          )}
          {paso < PASOS.length - 1 ? (
            <button type="button" onClick={siguiente} className="flex-1 rounded-lg bg-teal-700 px-4 py-3 font-medium text-white hover:bg-teal-800">
              Continuar
            </button>
          ) : (
            <button type="button" onClick={publicar} disabled={pendiente} className="flex-1 rounded-lg bg-teal-700 px-4 py-3 font-medium text-white hover:bg-teal-800 disabled:opacity-60">
              {pendiente ? "Publicando..." : "Publicar turno"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
