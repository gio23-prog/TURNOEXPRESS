"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ingresar } from "./actions";

const input =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700";

export default function Ingresar() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [pendiente, iniciar] = useTransition();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    iniciar(async () => {
      const r = await ingresar({ email, password });
      if (r) {
        setErr(r.errores ?? {});
        setMsg(r.mensaje);
      }
    });
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-semibold text-stone-900">Ingresar</h1>
      <form onSubmit={enviar} className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-stone-700">Correo</span>
          <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          {err.email && <span role="alert" className="mt-1 block text-sm text-red-700">{err.email}</span>}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-stone-700">Contraseña</span>
          <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          {err.password && <span role="alert" className="mt-1 block text-sm text-red-700">{err.password}</span>}
        </label>
        {msg && <p role="alert" className="text-sm text-red-700">{msg}</p>}
        <button disabled={pendiente} className="w-full rounded-lg bg-teal-700 px-4 py-3 font-medium text-white hover:bg-teal-800 disabled:opacity-60">
          {pendiente ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
      <p className="mt-6 text-sm text-stone-600">
        ¿No tienes cuenta? <Link href="/registro" className="font-medium text-teal-800 underline">Crear cuenta</Link>
      </p>
    </main>
  );
}