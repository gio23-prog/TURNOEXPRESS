"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { registrar } from "./actions";
import { LogoCompleto } from "@/components/Logo";
import { AVISO_MEDIO } from "@/lib/legal";
import type { RegistroInput } from "@/lib/schemas/auth";

const input =
  "w-full rounded-lg border border-borde-fuerte bg-white px-3 py-2 text-marino focus:outline-none focus:ring-2 focus:ring-turquesa";

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
      if (!r) return; // la acción redirigió (sesión creada sin confirmar correo)
      setErr(r.errores ?? {});
      setMsg({ ok: r.ok, texto: r.mensaje });
    });
  }

  if (msg?.ok) {
    return (
      <main className="mx-auto max-w-md p-6">
        <Link href="/" aria-label="Turnoexpress, ir al inicio" className="mb-8 flex justify-center">
          <LogoCompleto />
        </Link>
        <h1 className="text-2xl font-semibold text-marino">Revisa tu correo</h1>
        <p className="mt-2 text-texto-suave">{msg.texto}</p>
        <Link href="/ingresar" className="mt-6 inline-block font-medium text-turquesa-oscuro underline">Ir a ingresar</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <Link href="/" aria-label="Turnoexpress, ir al inicio" className="mb-8 flex justify-center">
        <LogoCompleto />
      </Link>
      <h1 className="text-2xl font-semibold text-marino">Crear cuenta</h1>

      {paso === 1 ? (
        <section className="mt-6 space-y-3">
          <p className="text-sm text-texto-suave">¿Qué quieres hacer?</p>
          {TIPOS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { set("tipo", t.id); setPaso(2); }}
              className="w-full rounded-lg border border-borde-fuerte bg-white p-4 text-left hover:border-turquesa"
            >
              <span className="block font-medium text-marino">{t.titulo}</span>
              <span className="block text-sm text-texto-suave">{t.texto}</span>
            </button>
          ))}
        </section>
      ) : (
        <form onSubmit={enviar} className="mt-6 space-y-4">
          <button type="button" onClick={() => setPaso(1)} className="text-sm text-texto-suave underline">
            Cambiar tipo de cuenta
          </button>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-texto-suave">{d.tipo === "empresa" ? "Nombre de la empresa" : "Tu nombre"}</span>
            <input className={input} value={d.nombre} onChange={(e) => set("nombre", e.target.value)} autoComplete="name" />
            {err.nombre && <span role="alert" className="mt-1 block text-sm text-red-700">{err.nombre}</span>}
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-texto-suave">Correo</span>
            <input className={input} type="email" value={d.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" />
            {err.email && <span role="alert" className="mt-1 block text-sm text-red-700">{err.email}</span>}
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-texto-suave">Contraseña (mínimo 8 caracteres)</span>
            <input className={input} type="password" value={d.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" />
            {err.password && <span role="alert" className="mt-1 block text-sm text-red-700">{err.password}</span>}
          </label>

          <label className="flex items-start gap-2 text-sm text-texto-suave">
            <input type="checkbox" className="mt-1" checked={d.consentimiento} onChange={(e) => set("consentimiento", e.target.checked)} />
            <span>
              Acepto los <Link href="/terminos" target="_blank" className="font-medium text-turquesa-oscuro underline">términos de uso</Link> y
              la <Link href="/privacidad" target="_blank" className="font-medium text-turquesa-oscuro underline">política de privacidad</Link>.
              Entiendo que Turnoexpress es un medio de difusión y no un empleador.
            </span>
          </label>
          {err.consentimiento && <p role="alert" className="text-sm text-red-700">{err.consentimiento}</p>}

          <label className="flex items-start gap-2 text-sm text-texto-suave">
            <input type="checkbox" className="mt-1" checked={d.mayorEdad} onChange={(e) => set("mayorEdad", e.target.checked)} />
            Declaro ser mayor de 18 años.
          </label>
          {err.mayorEdad && <p role="alert" className="text-sm text-red-700">{err.mayorEdad}</p>}

          {msg && !msg.ok && <p role="alert" className="text-sm text-red-700">{msg.texto}</p>}

          <button disabled={pendiente} className="w-full rounded-lg bg-turquesa-oscuro px-4 py-3 font-medium text-white hover:bg-turquesa-hover disabled:opacity-60">
            {pendiente ? "Creando cuenta..." : "Crear cuenta"}
          </button>
        </form>
      )}

      <p className="mt-6 text-sm text-texto-suave">
        ¿Ya tienes cuenta? <Link href="/ingresar" className="font-medium text-turquesa-oscuro underline">Ingresar</Link>
      </p>
      <p className="mt-8 text-xs text-texto-tenue">
        {AVISO_MEDIO}{" "}
        <Link href="/aviso-legal" className="underline">Aviso legal</Link>
      </p>
    </main>
  );
}