"use client";

import { useState, useTransition } from "react";
import { responderOferta } from "./actions";
import { CONDICION_ASISTENCIA } from "@/lib/condiciones";

export function PanelOferta({
  jobId, offerId, resumen, vence, mensaje, hayCruce,
}: {
  jobId: string; offerId: string; resumen: string; vence: string; mensaje: string | null; hayCruce: boolean;
}) {
  const [disponible, setDisponible] = useState(false);
  const [asistencia, setAsistencia] = useState(false);
  const [justificacion, setJustificacion] = useState("");
  const [rechazar, setRechazar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const responder = (aceptar: boolean) =>
    iniciar(async () => {
      const r = await responderOferta(jobId, offerId, aceptar, disponible, asistencia, hayCruce ? justificacion : undefined);
      setError(r.ok ? null : r.mensaje);
    });

  return (
    <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="text-base font-semibold">¡Tienes una oferta!</p>
      <p>{resumen}</p>
      {mensaje && <p className="rounded-lg bg-white/70 p-2 italic">&ldquo;{mensaje}&rdquo;</p>}
      <p className="text-amber-900">Responde antes del {vence}.</p>

      <label className="flex items-start gap-2 font-medium">
        <input id="o-disponible" type="checkbox" className="mt-0.5 size-4" checked={disponible} onChange={(e) => setDisponible(e.target.checked)} />
        Confirmo que tengo disponibilidad para todo el turno
      </label>

      <label className="flex items-start gap-2 rounded-lg bg-white/70 p-3">
        <input id="o-asistencia" type="checkbox" className="mt-0.5 size-4 shrink-0" checked={asistencia} onChange={(e) => setAsistencia(e.target.checked)} />
        <span><span className="font-medium">Compromiso de asistencia. </span>{CONDICION_ASISTENCIA}</span>
      </label>

      {hayCruce && (
        <label className="block">
          <span className="mb-1 block font-medium">Tienes otro turno confirmado en ese horario. Explica por qué puedes hacer ambos:</span>
          <textarea id="o-justificacion" rows={2} maxLength={300} value={justificacion} onChange={(e) => setJustificacion(e.target.value)}
            className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700" />
        </label>
      )}

      {error && <p role="alert" className="font-medium text-red-700">{error}</p>}

      {!rechazar ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" disabled={pendiente} onClick={() => responder(true)}
            className="flex-1 rounded-lg bg-teal-700 px-4 py-3 font-semibold text-white hover:bg-teal-800 disabled:opacity-60">
            {pendiente ? "Enviando..." : "Aceptar turno"}
          </button>
          <button type="button" disabled={pendiente} onClick={() => setRechazar(true)}
            className="rounded-lg border border-stone-300 bg-white px-4 py-3 font-medium text-stone-800">
            Rechazar
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="font-medium">¿Seguro que quieres rechazar esta oferta? No podrás volver a postular a este turno.</p>
          <div className="flex gap-2">
            <button type="button" disabled={pendiente} onClick={() => responder(false)}
              className="rounded-lg bg-stone-800 px-4 py-2 font-medium text-white disabled:opacity-60">Sí, rechazar</button>
            <button type="button" onClick={() => setRechazar(false)} className="rounded-lg border border-stone-300 bg-white px-4 py-2 font-medium">
              Volver
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
