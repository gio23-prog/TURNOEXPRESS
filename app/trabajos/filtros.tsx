"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export type ValoresFiltro = {
  region: string; comuna: string; rubro: string; desde: string; pagoMin: string; texto: string; orden: string;
};

type Opcion = { id: number; nombre: string };

const campo = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700";
const etiqueta = "mb-1 block text-sm font-medium text-stone-700";

export default function Filtros({
  valores, atajo, regiones, comunas, rubros,
}: {
  valores: ValoresFiltro;
  atajo: string;
  regiones: Opcion[];
  comunas: (Opcion & { regionId: number })[];
  rubros: Opcion[];
}) {
  const router = useRouter();
  const [v, setV] = useState(valores);
  const [pendiente, iniciar] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const set = (k: keyof ValoresFiltro, val: string) => setV((p) => ({ ...p, [k]: val }));

  const comunasRegion = comunas.filter((c) => String(c.regionId) === v.region);
  const activos = [valores.region, valores.rubro, valores.desde, valores.pagoMin, valores.texto].filter(Boolean).length;

  function aplicar(e: FormEvent) {
    e.preventDefault();
    const q = new URLSearchParams();
    const pares: [string, string][] = [
      ["region", v.region], ["comuna", v.comuna], ["rubro", v.rubro], ["desde", v.desde],
      ["pago_min", v.pagoMin.replace(/\D/g, "")], ["q", v.texto.trim()],
      ["orden", v.orden === "inicio" ? "" : v.orden], ["atajo", atajo],
    ];
    for (const [k, val] of pares) if (val) q.set(k, val);
    iniciar(() => router.push(q.size ? `/trabajos?${q}` : "/trabajos"));
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white lg:self-start">
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls="filtros"
        onClick={() => setAbierto((a) => !a)}
        className="flex w-full items-center justify-between px-4 py-3 font-semibold lg:hidden"
      >
        <span>
          Filtros{activos > 0 && <span className="ml-2 text-sm font-normal text-teal-800">{activos} activos</span>}
        </span>
        <span aria-hidden className={`text-stone-400 transition ${abierto ? "rotate-180" : ""}`}>▾</span>
      </button>

      <form onSubmit={aplicar} id="filtros" className={`space-y-4 border-t border-stone-100 p-4 lg:block lg:border-0 ${abierto ? "block" : "hidden"}`}>
        <label className="block">
          <span className={etiqueta}>Buscar</span>
          <input id="f-texto" className={campo} value={v.texto} maxLength={60} onChange={(e) => set("texto", e.target.value)} placeholder="Ej: garzón, bodega" />
        </label>

        <label className="block">
          <span className={etiqueta}>Región</span>
          <select id="f-region" className={campo} value={v.region} onChange={(e) => setV((p) => ({ ...p, region: e.target.value, comuna: "" }))}>
            <option value="">Todo Chile</option>
            {regiones.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        </label>

        <label className="block">
          <span className={etiqueta}>Comuna</span>
          <select id="f-comuna" className={campo} value={v.comuna} disabled={!v.region} onChange={(e) => set("comuna", e.target.value)}>
            <option value="">{v.region ? "Todas las comunas" : "Primero elige una región"}</option>
            {comunasRegion.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>

        <label className="block">
          <span className={etiqueta}>Rubro</span>
          <select id="f-rubro" className={campo} value={v.rubro} onChange={(e) => set("rubro", e.target.value)}>
            <option value="">Todos los rubros</option>
            {rubros.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        </label>

        <label className="block">
          <span className={etiqueta}>Desde el día</span>
          <input id="f-desde" type="date" className={campo} value={v.desde} onChange={(e) => set("desde", e.target.value)} />
        </label>

        <label className="block">
          <span className={etiqueta}>Pago mínimo por hora (CLP)</span>
          <input id="f-pago" inputMode="numeric" className={campo} value={v.pagoMin} onChange={(e) => set("pagoMin", e.target.value)} placeholder="Ej: 5000" />
        </label>

        <label className="block">
          <span className={etiqueta}>Ordenar por</span>
          <select id="f-orden" className={campo} value={v.orden} onChange={(e) => set("orden", e.target.value)}>
            <option value="inicio">Más próximos</option>
            <option value="recientes">Publicados recientemente</option>
            <option value="tarifa">Mejor pago por hora</option>
          </select>
        </label>

        <div className="flex gap-2 pt-1">
          <button disabled={pendiente} className="flex-1 rounded-lg bg-teal-700 px-4 py-2.5 font-medium text-white hover:bg-teal-800 disabled:opacity-60">
            {pendiente ? "Buscando..." : "Aplicar"}
          </button>
          <button
            type="button"
            onClick={() => {
              setV({ region: "", comuna: "", rubro: "", desde: "", pagoMin: "", texto: "", orden: "inicio" });
              iniciar(() => router.push("/trabajos"));
            }}
            className="rounded-lg border border-stone-300 px-4 py-2.5 font-medium text-stone-700"
          >
            Limpiar
          </button>
        </div>
      </form>
    </div>
  );
}
