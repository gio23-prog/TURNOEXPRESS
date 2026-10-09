"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { errores, registroTrabajadorSchema, type RegistroTrabajadorInput } from "@/lib/schemas/trabajador";
import { formatearRut, limpiarRut, rutValido } from "@/lib/rut";
import { registrarTrabajador } from "./actions";

type Opcion = { id: number; nombre: string };

export const campo =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700 disabled:bg-stone-100";

export function Campo({ id, label, ayuda, error, children }: { id: string; label: string; ayuda?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-stone-700">{label}</label>
      {children}
      {ayuda && !error && <p className="mt-1 text-xs text-stone-500">{ayuda}</p>}
      {error && <p role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}

const VACIO: RegistroTrabajadorInput = {
  nombre: "", email: "", password: "", telefono: "", rut: "", region: "", comuna: "", direccion: "", consentimiento: false,
};

export default function FormularioTrabajador({ regiones, comunas }: { regiones: Opcion[]; comunas: (Opcion & { regionId: number })[] }) {
  const [d, setD] = useState<RegistroTrabajadorInput>(VACIO);
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [verClave, setVerClave] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const set = (k: keyof RegistroTrabajadorInput, v: string | boolean) => setD((p) => ({ ...p, [k]: v }));
  const comunasRegion = comunas.filter((c) => String(c.regionId) === d.region);

  function enviar(e: FormEvent) {
    e.preventDefault();
    const e1 = errores(registroTrabajadorSchema, d);
    setErr(e1);
    if (Object.keys(e1).length) {
      document.getElementById(Object.keys(e1)[0])?.focus();
      return;
    }
    iniciar(async () => {
      const r = await registrarTrabajador(d);
      setErr(r.errores ?? {});
      if (r.ok && r.destino) {
        window.location.assign(r.destino); // recarga completa para que el servidor lea la nueva sesión
        return;
      }
      setMsg({ ok: r.ok, texto: r.mensaje });
    });
  }

  if (msg?.ok) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="text-xl font-bold">Revisa tu correo</h2>
        <p className="mt-2 text-stone-700">{msg.texto}</p>
        <Link href="/ingresar" className="mt-4 inline-block font-medium text-teal-800 underline">Ir a ingresar</Link>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} noValidate className="space-y-5">
      <section className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Campo id="nombre" label="Nombre completo" error={err.nombre}>
            <input id="nombre" className={campo} autoComplete="name" value={d.nombre} onChange={(e) => set("nombre", e.target.value)} />
          </Campo>
        </div>
        <Campo id="email" label="Correo" error={err.email}>
          <input id="email" type="email" className={campo} autoComplete="email" value={d.email} onChange={(e) => set("email", e.target.value)} />
        </Campo>
        <Campo id="password" label="Contraseña" ayuda="Mínimo 8 caracteres." error={err.password}>
          <div className="relative">
            <input id="password" type={verClave ? "text" : "password"} className={`${campo} pr-20`} autoComplete="new-password"
              value={d.password} onChange={(e) => set("password", e.target.value)} />
            <button type="button" onClick={() => setVerClave((v) => !v)} className="absolute inset-y-0 right-0 px-3 text-sm font-medium text-teal-800">
              {verClave ? "Ocultar" : "Mostrar"}
            </button>
          </div>
        </Campo>
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
      </section>

      <div>
        <label className="flex items-start gap-2 text-sm text-stone-700">
          <input id="consentimiento" type="checkbox" className="mt-1 size-4" checked={d.consentimiento}
            onChange={(e) => set("consentimiento", e.target.checked)} />
          <span>
            Soy mayor de 18 años y acepto los{" "}
            <a href="/legal/terminos" target="_blank" className="font-medium text-teal-800 underline">Términos y Condiciones</a>{" "}
            y la <a href="/legal/privacidad" target="_blank" className="font-medium text-teal-800 underline">Política de Privacidad</a>.
          </span>
        </label>
        {err.consentimiento && <p role="alert" className="mt-1 text-sm text-red-700">{err.consentimiento}</p>}
      </div>

      {msg && !msg.ok && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-800">{msg.texto}</p>}

      <button disabled={pendiente} className="w-full rounded-lg bg-teal-700 px-6 py-3 font-semibold text-white hover:bg-teal-800 disabled:opacity-60 sm:w-auto">
        {pendiente ? "Creando cuenta..." : "Crear cuenta y continuar"}
      </button>
    </form>
  );
}
