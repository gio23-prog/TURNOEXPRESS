"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { registrar } from "./actions";
import type { RegistroInput } from "@/lib/schemas/auth";

const input =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700";

const TIPOS = [
  { id: "trabajador", titulo: "Busco turnos", texto: "Quiero encontrar trabajos por horas y postular." },
  { id: "empresa", titulo: "Necesito personal", texto: "Quiero publicar turnos y recibir postulaciones." },
] as const;

export default function Registro() {
  const [paso, setPaso] = useState<1 | 2>(1);
  const [d, setD] = useState<RegistroInput>({ tipo: "trabajador", nombre: "", email: "", password: "", consentimiento: false, mayorEdad: false });
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const set = <K extends keyof RegistroInput>(k: K, v: RegistroInput[K]) => setD((p) => ({ ...p, [k]: v }));

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    iniciar(async () => {
      const r = await registrar(d);
      setErr(r.errores ?? {});
      setMsg({ ok: r.ok, texto: r.mensaje });
    });
  }

  if (msg?.ok) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-2xl font-semibold text-stone-900">Revisa tu correo</h1>
        <p className="mt-2 text-stone-700">{msg.texto}</p>
        <Link href="/ingresar" className="mt-6 inline-block font-medium text-teal-800 underline">Ir a ingresar</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-semibold text-stone-900">Crear cuenta</h1>

      {paso === 1 ? (
        <section className="mt-6 space-y-3">
          <p className="text-sm text-stone-600">¿Qué quieres hacer?</p>
          {TIPOS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { set("tipo", t.id); setPaso(2); }}
              className="w-full rounded-lg border border-stone-300 bg-white p-4 text-left hover:border-teal-700"
            >
              <span className="block font-medium text-stone-900">{t.titulo}</span>
              <span className="block text-sm text-stone-600">{t.texto}</span>
            </button>
          ))}
        </section>
      ) : (
        <form onSubmit={enviar} className="mt-6 space-y-4">
          <button type="button" onClick={() => setPaso(1)} className="text-sm text-stone-600 underline">
            Cambiar tipo de cuenta
          </button>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-stone-700">{d.tipo === "empresa" ? "Nombre de la empresa" : "Tu nombre"}</span>
            <input className={input} value={d.nombre} onChange={(e) => set("nombre", e.target.value)} autoComplete="name" />
            {err.nombre && <span role="alert" className="mt-1 block text-sm text-red-700">{err.nombre}</span>}
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-stone-700">Correo</span>
            <input className={input} type="email" value={d.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" />
            {err.email && <span role="alert" className="mt-1 block text-sm text-red-700">{err.email}</span>}
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-stone-700">Contraseña (mínimo 8 caracteres)</span>
            <input className={input} type="password" value={d.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" />
            {err.password && <span role="alert" className="mt-1 block text-sm text-red-700">{err.password}</span>}
          </label>

          <label className="flex items-start gap-2 text-sm text-stone-700">
            <input type="checkbox" className="mt-1" checked={d.consentimiento} onChange={(e) => set("consentimiento", e.target.checked)} />
            Acepto los términos de uso y la política de privacidad.
          </label>
          {err.consentimiento && <p role="alert" className="text-sm text-red-700">{err.consentimiento}</p>}

          <label className="flex items-start gap-2 text-sm text-stone-700">
            <input type="checkbox" className="mt-1" checked={d.mayorEdad} onChange={(e) => set("mayorEdad", e.target.checked)} />
            Declaro ser mayor de 18 años.
          </label>
          {err.mayorEdad && <p role="alert" className="text-sm text-red-700">{err.mayorEdad}</p>}

          {msg && !msg.ok && <p role="alert" className="text-sm text-red-700">{msg.texto}</p>}

          <button disabled={pendiente} className="w-full rounded-lg bg-teal-700 px-4 py-3 font-medium text-white hover:bg-teal-800 disabled:opacity-60">
            {pendiente ? "Creando cuenta..." : "Crear cuenta"}
          </button>
        </form>
      )}

      <p className="mt-6 text-sm text-stone-600">
        ¿Ya tienes cuenta? <Link href="/ingresar" className="font-medium text-teal-800 underline">Ingresar</Link>
      </p>
    </main>
  );
}