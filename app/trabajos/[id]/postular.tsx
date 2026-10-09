"use client";

import { useState, useTransition, type FormEvent } from "react";
import { postular, retirarPostulacion, type PostulacionInput } from "./actions";

const campo = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700";

export type PreguntaPublica = {
  id: string; position: number; prompt: string; kind: "si_no" | "opcion" | "texto"; options: string[] | null; required: boolean;
};

export function FormularioPostular({ jobId, horario, preguntas }: { jobId: string; horario: string; preguntas: PreguntaPublica[] }) {
  const [d, setD] = useState<PostulacionInput>({ mensaje: "", experiencia: "", disponibilidad: false, respuestas: {} });
  const responder = (id: string, v: string) => setD((p) => ({ ...p, respuestas: { ...p.respuestas, [id]: v } }));
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  function enviar(e: FormEvent) {
    e.preventDefault();
    const faltan = preguntas.filter((p) => p.required && !d.respuestas[p.id]?.trim());
    if (faltan.length) {
      setErr(Object.fromEntries(faltan.map((p) => [p.id, "Responde esta pregunta"])));
      document.getElementById(`r-${faltan[0].id}`)?.focus();
      return;
    }
    iniciar(async () => {
      const r = await postular(jobId, d);
      setErr(r.errores ?? {});
      setMsg({ ok: r.ok, texto: r.mensaje });
    });
  }

  if (msg?.ok) {
    return <p role="status" className="rounded-xl bg-teal-50 p-4 font-medium text-teal-900">{msg.texto}</p>;
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      {preguntas.length > 0 && (
        <div className="space-y-4 rounded-xl bg-stone-50 p-3">
          <p className="text-sm font-semibold text-stone-800">Preguntas de la empresa</p>
          {preguntas.map((p) => (
            <div key={p.id}>
              {p.kind === "texto" ? (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-stone-700">
                    {p.prompt}{!p.required && <span className="font-normal text-stone-500"> (opcional)</span>}
                  </span>
                  <textarea id={`r-${p.id}`} rows={2} maxLength={500} className={campo} value={d.respuestas[p.id] ?? ""}
                    onChange={(e) => responder(p.id, e.target.value)} />
                </label>
              ) : (
                <fieldset>
                  <legend className="mb-1 text-sm font-medium text-stone-700">
                    {p.prompt}{!p.required && <span className="font-normal text-stone-500"> (opcional)</span>}
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {(p.kind === "si_no" ? [["si", "Sí"], ["no", "No"]] : (p.options ?? []).map((o) => [o, o])).map(([v, t], k) => (
                      <label key={v}
                        className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal-700 ${
                          d.respuestas[p.id] === v ? "border-teal-700 bg-teal-700 text-white" : "border-stone-300 bg-white text-stone-700"}`}>
                        <input id={k === 0 ? `r-${p.id}` : undefined} type="radio" name={`r-${p.id}`} value={v} className="sr-only"
                          checked={d.respuestas[p.id] === v} onChange={() => responder(p.id, v)} />
                        {t}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              {err[p.id] && <p role="alert" className="mt-1 text-sm text-red-700">{err[p.id]}</p>}
            </div>
          ))}
        </div>
      )}
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-stone-700">Mensaje para la empresa (opcional)</span>
        <textarea id="p-mensaje" rows={3} maxLength={500} className={campo} value={d.mensaje}
          onChange={(e) => setD({ ...d, mensaje: e.target.value })} placeholder="Preséntate en pocas líneas" />
        {err.mensaje && <span role="alert" className="mt-1 block text-sm text-red-700">{err.mensaje}</span>}
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-stone-700">Experiencia relevante (opcional)</span>
        <textarea id="p-experiencia" rows={2} maxLength={500} className={campo} value={d.experiencia}
          onChange={(e) => setD({ ...d, experiencia: e.target.value })} placeholder="Ej: 2 años como garzón en restaurante" />
        {err.experiencia && <span role="alert" className="mt-1 block text-sm text-red-700">{err.experiencia}</span>}
      </label>
      <label className="flex items-start gap-2 text-sm text-stone-800">
        <input id="p-disponible" type="checkbox" className="mt-1 size-4" checked={d.disponibilidad}
          onChange={(e) => setD({ ...d, disponibilidad: e.target.checked })} />
        Confirmo que tengo disponibilidad {horario}.
      </label>
      {err.disponibilidad && <p role="alert" className="text-sm text-red-700">{err.disponibilidad}</p>}
      <p className="text-xs text-stone-500">
        Al postular, la empresa verá tu nombre, teléfono, correo y currículum para contactarte. Si retiras la postulación,
        dejará de verlos.
      </p>
      {msg && !msg.ok && <p role="alert" className="text-sm text-red-700">{msg.texto}</p>}
      <button disabled={pendiente} className="w-full rounded-lg bg-teal-700 px-4 py-3 font-semibold text-white hover:bg-teal-800 disabled:opacity-60">
        {pendiente ? "Enviando..." : "Postular"}
      </button>
    </form>
  );
}

export function BotonRetirar({ jobId, applicationId }: { jobId: string; applicationId: string }) {
  const [confirmar, setConfirmar] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  if (!confirmar) {
    return (
      <button type="button" onClick={() => setConfirmar(true)} className="text-sm font-medium text-stone-600 underline">
        Retirar mi postulación
      </button>
    );
  }
  return (
    <div className="space-y-2 text-sm">
      <p>¿Seguro que quieres retirar tu postulación? La empresa dejará de ver tus datos de contacto.</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pendiente}
          onClick={() => iniciar(async () => { const r = await retirarPostulacion(jobId, applicationId); setMsg(r.ok ? null : r.mensaje); })}
          className="rounded-lg bg-stone-800 px-3 py-2 font-medium text-white disabled:opacity-60"
        >
          {pendiente ? "Retirando..." : "Sí, retirar"}
        </button>
        <button type="button" onClick={() => setConfirmar(false)} className="rounded-lg border border-stone-300 px-3 py-2 font-medium">
          Cancelar
        </button>
      </div>
      {msg && <p role="alert" className="text-red-700">{msg}</p>}
    </div>
  );
}
