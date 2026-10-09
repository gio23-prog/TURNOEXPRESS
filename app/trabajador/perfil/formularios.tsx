"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Campo, campo } from "@/app/registro/trabajador";
import { formatearRut, limpiarRut, rutValido } from "@/lib/rut";
import {
  datosPersonalesSchema, errores, perfilProfesionalSchema,
  type DatosPersonalesInput, type PerfilProfesionalInput,
} from "@/lib/schemas/trabajador";
import { guardarDatos, guardarPerfil, subirCV } from "./actions";

type Opcion = { id: number; nombre: string };
type Comuna = Opcion & { regionId: number };
type Msg = { ok: boolean; texto: string } | null;

const tarjeta = "space-y-4 rounded-2xl border border-stone-200 bg-white p-5";
const boton = "w-full rounded-lg bg-teal-700 px-6 py-3 font-semibold text-white hover:bg-teal-800 disabled:opacity-60 sm:w-auto";

function Aviso({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p role={msg.ok ? "status" : "alert"}
      className={`rounded-lg p-3 text-sm font-medium ${msg.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>
      {msg.texto}
    </p>
  );
}

// 1. Datos personales ---------------------------------------------------------
export function FormDatos({
  inicial, regiones, comunas, siguiente,
}: { inicial: DatosPersonalesInput; regiones: Opcion[]; comunas: Comuna[]; siguiente: string | null }) {
  const router = useRouter();
  const [d, setD] = useState(inicial);
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Msg>(null);
  const [pendiente, iniciar] = useTransition();
  const set = (k: keyof DatosPersonalesInput, v: string) => setD((p) => ({ ...p, [k]: v }));
  const comunasRegion = comunas.filter((c) => String(c.regionId) === d.region);

  function enviar(e: FormEvent) {
    e.preventDefault();
    const e1 = errores(datosPersonalesSchema, d);
    setErr(e1);
    if (Object.keys(e1).length) { document.getElementById(Object.keys(e1)[0])?.focus(); return; }
    iniciar(async () => {
      const r = await guardarDatos(d);
      setErr(r.errores ?? {});
      setMsg({ ok: r.ok, texto: r.mensaje });
      if (r.ok && siguiente) router.push(siguiente);
      else router.refresh();
    });
  }

  return (
    <form onSubmit={enviar} noValidate className={tarjeta}>
      <div>
        <h2 className="text-lg font-bold">Datos personales</h2>
        <p className="text-sm text-stone-600">Cuando postulas a una oferta, esa empresa ve tu nombre, teléfono, correo, perfil y currículum para contactarte. Tu RUT y tu dirección no los ve nadie.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Campo id="nombre" label="Nombre completo" error={err.nombre}>
            <input id="nombre" className={campo} autoComplete="name" value={d.nombre} onChange={(e) => set("nombre", e.target.value)} />
          </Campo>
        </div>
        <Campo id="telefono" label="Teléfono" error={err.telefono}>
          <div className="flex">
            <span className="flex items-center rounded-l-lg border border-r-0 border-stone-300 bg-stone-100 px-3 text-stone-600">+56</span>
            <input id="telefono" type="tel" inputMode="tel" autoComplete="tel-national" className={`${campo} rounded-l-none`}
              value={d.telefono} onChange={(e) => set("telefono", e.target.value)} placeholder="9 1234 5678" />
          </div>
        </Campo>
        <Campo id="rut" label="RUT" error={err.rut}>
          <input id="rut" className={campo} autoComplete="off" value={d.rut} placeholder="12.345.678-9"
            onChange={(e) => set("rut", e.target.value)}
            onBlur={() => {
              if (!limpiarRut(d.rut)) return;
              set("rut", formatearRut(d.rut));
              setErr((x) => ({ ...x, rut: rutValido(d.rut) ? "" : "RUT inválido. Revisa el dígito verificador" }));
            }} />
        </Campo>
        <Campo id="region" label="Región" error={err.region}>
          <select id="region" className={campo} value={d.region} onChange={(e) => setD((p) => ({ ...p, region: e.target.value, comuna: "" }))}>
            <option value="">Elige una región</option>
            {regiones.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        </Campo>
        <Campo id="comuna" label="Comuna" error={err.comuna}>
          <select id="comuna" className={campo} value={d.comuna} disabled={!d.region} onChange={(e) => set("comuna", e.target.value)}>
            <option value="">{d.region ? "Elige una comuna" : "Primero elige una región"}</option>
            {comunasRegion.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
        <div className="sm:col-span-2">
          <Campo id="direccion" label="Dirección" ayuda="Es privada: no la ve ninguna empresa." error={err.direccion}>
            <input id="direccion" className={campo} autoComplete="street-address" value={d.direccion}
              onChange={(e) => set("direccion", e.target.value)} placeholder="Calle, número y depto." />
          </Campo>
        </div>
      </div>
      <Aviso msg={msg} />
      <button disabled={pendiente} className={boton}>
        {pendiente ? "Guardando..." : siguiente ? "Guardar y continuar" : "Guardar datos"}
      </button>
    </form>
  );
}

// 2. Currículum ---------------------------------------------------------------
export function FormCV({ actual, siguiente }: { actual: { subido: string | null } | null; siguiente: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [nombre, setNombre] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [pendiente, iniciar] = useTransition();

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const archivo = input.current?.files?.[0];
    if (!archivo) { setMsg({ ok: false, texto: "Elige un archivo PDF." }); return; }
    if (archivo.size > 5 * 1024 * 1024) { setMsg({ ok: false, texto: "El archivo pesa más de 5 MB." }); return; }
    const form = new FormData();
    form.set("cv", archivo);
    iniciar(async () => {
      const r = await subirCV(form);
      setMsg({ ok: r.ok, texto: r.mensaje });
      if (r.ok) {
        if (input.current) input.current.value = "";
        setNombre(null);
        if (!actual) router.push(siguiente); else router.refresh();
      }
    });
  }

  return (
    <form onSubmit={enviar} className={tarjeta}>
      <div>
        <h2 className="text-lg font-bold">Currículum</h2>
        <p className="text-sm text-stone-600">
          Se envía a la empresa cada vez que postulas a una oferta. Solo esa empresa puede verlo.
        </p>
      </div>

      {actual && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-stone-50 p-3 text-sm">
          <span>
            <span className="font-medium">Currículum actual</span>
            {actual.subido && <span className="text-stone-600"> · subido el {actual.subido}</span>}
          </span>
          <a href="/trabajador/perfil/cv" target="_blank" rel="noopener" className="font-medium text-teal-800 underline">Ver mi currículum</a>
        </div>
      )}

      <label htmlFor="cv"
        className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-stone-300 p-6 text-center hover:border-teal-700 focus-within:ring-2 focus-within:ring-teal-700">
        <span className="font-semibold text-teal-800">{nombre ?? (actual ? "Elegir un currículum nuevo" : "Elegir archivo")}</span>
        <span className="text-xs text-stone-500">Solo PDF, hasta 5 MB.</span>
        <input id="cv" ref={input} type="file" accept="application/pdf,.pdf" className="sr-only"
          onChange={(e) => { setNombre(e.target.files?.[0]?.name ?? null); setMsg(null); }} />
      </label>
      {actual && (
        <p className="text-xs text-stone-500">Las postulaciones que ya enviaste mantienen el currículum que tenían en ese momento.</p>
      )}

      <Aviso msg={msg} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <button disabled={pendiente || !nombre} className={boton}>{pendiente ? "Subiendo..." : "Subir currículum"}</button>
        {actual && (
          <button type="button" onClick={() => router.push(siguiente)}
            className="rounded-lg border border-stone-300 bg-white px-6 py-3 font-medium text-stone-800">
            Ir a mi perfil
          </button>
        )}
      </div>
    </form>
  );
}

// 3. Perfil profesional ---------------------------------------------------------
export function FormPerfil({
  inicial, rubros, regiones, comunas, regionInicial,
}: {
  inicial: PerfilProfesionalInput; rubros: Opcion[]; regiones: Opcion[]; comunas: Comuna[]; regionInicial: string;
}) {
  const router = useRouter();
  const [d, setD] = useState(inicial);
  const [region, setRegion] = useState(regionInicial);
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Msg>(null);
  const [pendiente, iniciar] = useTransition();
  const set = <K extends keyof PerfilProfesionalInput>(k: K, v: PerfilProfesionalInput[K]) => setD((p) => ({ ...p, [k]: v }));
  const alternar = (k: "rubros" | "comunas", id: number) =>
    setD((p) => ({ ...p, [k]: p[k].includes(id) ? p[k].filter((x) => x !== id) : [...p[k], id] }));
  const nombreComuna = new Map(comunas.map((c) => [c.id, c.nombre]));
  const comunasRegion = comunas.filter((c) => String(c.regionId) === region);

  function enviar(e: FormEvent) {
    e.preventDefault();
    const e1 = errores(perfilProfesionalSchema, d);
    setErr(e1);
    if (Object.keys(e1).length) { document.getElementById(Object.keys(e1)[0])?.focus(); return; }
    iniciar(async () => {
      const r = await guardarPerfil(d);
      setErr(r.errores ?? {});
      setMsg({ ok: r.ok, texto: r.mensaje });
      if (r.ok) router.refresh();
    });
  }

  return (
    <form onSubmit={enviar} noValidate className={tarjeta}>
      <div>
        <h2 className="text-lg font-bold">Perfil</h2>
        <p className="text-sm text-stone-600">Es lo que ven las empresas cuando postulas a una de sus ofertas.</p>
      </div>

      <Campo id="nombreVisible" label="Nombre que ven las empresas" ayuda="Por ejemplo, tu nombre y la inicial de tu apellido." error={err.nombreVisible}>
        <input id="nombreVisible" className={campo} maxLength={60} value={d.nombreVisible} onChange={(e) => set("nombreVisible", e.target.value)} />
      </Campo>

      <Campo id="descripcion" label="Sobre ti" ayuda={`${d.descripcion.length}/1000 · Cuéntale a la empresa en qué eres bueno y cómo trabajas.`} error={err.descripcion}>
        <textarea id="descripcion" rows={3} maxLength={1000} className={campo} value={d.descripcion}
          onChange={(e) => set("descripcion", e.target.value)} />
      </Campo>

      <Campo id="experiencia" label="Experiencia" ayuda={`${d.experiencia.length}/2000 · Lugares y tareas que has realizado.`} error={err.experiencia}>
        <textarea id="experiencia" rows={4} maxLength={2000} className={campo} value={d.experiencia}
          onChange={(e) => set("experiencia", e.target.value)} />
      </Campo>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="anios" label="Años de experiencia" error={err.anios}>
          <input id="anios" inputMode="numeric" className={campo} maxLength={2} value={d.anios}
            onChange={(e) => set("anios", e.target.value.replace(/\D/g, ""))} />
        </Campo>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-stone-700">
          <input type="checkbox" className="size-4" checked={d.emiteBoleta} onChange={(e) => set("emiteBoleta", e.target.checked)} />
          Puedo emitir boleta de honorarios
        </label>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-stone-700">Rubros en los que buscas trabajo</legend>
        <div className="flex flex-wrap gap-2">
          {rubros.map((r) => {
            const sel = d.rubros.includes(r.id);
            return (
              <button key={r.id} type="button" aria-pressed={sel} onClick={() => alternar("rubros", r.id)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                  sel ? "border-teal-700 bg-teal-700 text-white" : "border-stone-300 bg-white text-stone-700 hover:border-teal-700"}`}>
                {r.nombre}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-stone-700">Comunas donde puedes trabajar</legend>
        {d.comunas.length > 0 && (
          <ul className="mb-3 flex flex-wrap gap-2">
            {d.comunas.map((id) => (
              <li key={id}>
                <button type="button" onClick={() => alternar("comunas", id)} aria-label={`Quitar ${nombreComuna.get(id)}`}
                  className="rounded-full bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-900 ring-1 ring-teal-700/30 hover:bg-teal-100">
                  {nombreComuna.get(id)} ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <select id="comunas" aria-label="Región para agregar comunas" className={campo} value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">Elige una región para agregar comunas</option>
          {regiones.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
        {region && (
          <div className="mt-2 grid max-h-56 grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto rounded-lg border border-stone-200 p-3 text-sm sm:grid-cols-3">
            {comunasRegion.map((c) => (
              <label key={c.id} className="flex items-center gap-2">
                <input type="checkbox" className="size-4" checked={d.comunas.includes(c.id)} onChange={() => alternar("comunas", c.id)} />
                {c.nombre}
              </label>
            ))}
          </div>
        )}
        {err.comunas && <p role="alert" className="mt-1 text-sm text-red-700">{err.comunas}</p>}
      </fieldset>

      <Aviso msg={msg} />
      <button disabled={pendiente} className={boton}>{pendiente ? "Guardando..." : "Guardar perfil"}</button>
    </form>
  );
}
