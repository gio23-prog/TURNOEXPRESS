"use client";

import { useState, useTransition } from "react";
import { cambiarEstado, enviarOferta } from "./actions";

export function AccionesPostulante({ jobId, applicationId, estado }: { jobId: string; applicationId: string; estado: string }) {
  const [modo, setModo] = useState<"botones" | "oferta" | "descartar">("botones");
  const [mensaje, setMensaje] = useState("");
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const ejecutar = (fn: () => Promise<{ ok: boolean; mensaje: string }>) =>
    iniciar(async () => {
      const r = await fn();
      setResultado({ ok: r.ok, texto: r.mensaje });
      if (r.ok) setModo("botones");
    });

  if (!["pendiente", "en_revision", "preseleccionada"].includes(estado)) return null;

  if (modo === "oferta") {
    return (
      <div className="space-y-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-stone-700">Mensaje para el trabajador (opcional)</span>
          <textarea id={`oferta-${applicationId}`} rows={2} maxLength={500} value={mensaje} onChange={(e) => setMensaje(e.target.value)}
            placeholder="Ej: Te esperamos 15 minutos antes. Pregunta por Carla en la entrada."
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700" />
        </label>
        <p className="text-xs text-stone-500">La oferta usa el horario y el pago publicados. El trabajador tiene hasta 12 horas para responder.</p>
        <div className="flex gap-2">
          <button type="button" disabled={pendiente} onClick={() => ejecutar(() => enviarOferta(jobId, applicationId, mensaje))}
            className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white hover:bg-teal-800 disabled:opacity-60">
            {pendiente ? "Enviando..." : "Enviar oferta"}
          </button>
          <button type="button" onClick={() => setModo("botones")} className="rounded-lg border border-stone-300 px-4 py-2 font-medium">
            Cancelar
          </button>
        </div>
        {resultado && !resultado.ok && <p role="alert" className="text-sm text-red-700">{resultado.texto}</p>}
      </div>
    );
  }

  if (modo === "descartar") {
    return (
      <div className="space-y-2 text-sm">
        <p className="font-medium">¿Descartar a este postulante? Le avisaremos que no fue seleccionado.</p>
        <div className="flex gap-2">
          <button type="button" disabled={pendiente} onClick={() => ejecutar(() => cambiarEstado(jobId, applicationId, "rechazada"))}
            className="rounded-lg bg-stone-800 px-4 py-2 font-medium text-white disabled:opacity-60">Sí, descartar</button>
          <button type="button" onClick={() => setModo("botones")} className="rounded-lg border border-stone-300 px-4 py-2 font-medium">Volver</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setModo("oferta")}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">
          Enviar oferta
        </button>
        {estado !== "preseleccionada" && (
          <button type="button" disabled={pendiente} onClick={() => ejecutar(() => cambiarEstado(jobId, applicationId, "preseleccionada"))}
            className="rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 disabled:opacity-60">
            Preseleccionar
          </button>
        )}
        <button type="button" onClick={() => setModo("descartar")}
          className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50">
          Descartar
        </button>
      </div>
      {resultado && (
        <p role={resultado.ok ? "status" : "alert"} className={`text-sm ${resultado.ok ? "text-teal-800" : "text-red-700"}`}>{resultado.texto}</p>
      )}
    </div>
  );
}
