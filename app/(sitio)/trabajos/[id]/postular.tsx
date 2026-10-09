"use client";

import { useState, useTransition } from "react";
import { postular } from "./actions";
import type { PostularInput } from "@/lib/schemas/postular";

const input =
  "w-full rounded-lg border border-borde-fuerte bg-white px-3 py-2 text-marino focus:outline-none focus:ring-2 focus:ring-turquesa";

export default function Postular({ jobId, aviso }: { jobId: string; aviso?: string }) {
  const [d, setD] = useState<PostularInput>({ disponible: false, mensaje: "", experiencia: "" });
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const set = <K extends keyof PostularInput>(k: K, v: PostularInput[K]) => setD((p) => ({ ...p, [k]: v }));

  if (msg?.ok) {
    return <p role="status" className="rounded-lg bg-turquesa-claro p-4 text-sm text-marino">{msg.texto}</p>;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await postular(jobId, d);
          setErr(r.errores ?? {});
          setMsg({ ok: r.ok, texto: r.mensaje });
        });
      }}
      className="space-y-4"
    >
      {aviso && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{aviso}</p>}
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-texto-suave">Mensaje para la empresa (opcional)</span>
        <textarea rows={3} maxLength={500} value={d.mensaje} onChange={(e) => set("mensaje", e.target.value)} className={input} />
        {err.mensaje && <span role="alert" className="mt-1 block text-sm text-red-700">{err.mensaje}</span>}
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-texto-suave">Experiencia relacionada (opcional)</span>
        <textarea rows={3} maxLength={500} value={d.experiencia} onChange={(e) => set("experiencia", e.target.value)} className={input}
          placeholder="Ej: 2 años como garzón en restaurante con 80 cubiertos" />
        {err.experiencia && <span role="alert" className="mt-1 block text-sm text-red-700">{err.experiencia}</span>}
      </label>
      <label className="flex items-start gap-2 text-sm text-texto-suave">
        <input type="checkbox" className="mt-1" checked={d.disponible} onChange={(e) => set("disponible", e.target.checked)} />
        Confirmo que tengo disponibilidad para todo el horario del turno.
      </label>
      {err.disponible && <p role="alert" className="text-sm text-red-700">{err.disponible}</p>}
      {msg && !msg.ok && <p role="alert" className="text-sm text-red-700">{msg.texto}</p>}
      <button disabled={pendiente} className="w-full rounded-lg bg-turquesa-oscuro px-4 py-3 font-medium text-white hover:bg-turquesa-hover disabled:opacity-60">
        {pendiente ? "Enviando..." : "Postular"}
      </button>
    </form>
  );
}
