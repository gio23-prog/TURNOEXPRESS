"use client";

import { useState, useTransition } from "react";
import { cambiarEstado, cerrarOferta } from "./actions";

type Res = { ok: boolean; texto: string } | null;

export function AccionesPostulante({ jobId, applicationId, estado }: { jobId: string; applicationId: string; estado: string }) {
  const [confirmar, setConfirmar] = useState(false);
  const [resultado, setResultado] = useState<Res>(null);
  const [pendiente, iniciar] = useTransition();

  const ejecutar = (nuevo: "preseleccionada" | "en_revision" | "rechazada") =>
    iniciar(async () => {
      const r = await cambiarEstado(jobId, applicationId, nuevo);
      setResultado({ ok: r.ok, texto: r.mensaje });
      if (r.ok) setConfirmar(false);
    });

  if (!["pendiente", "en_revision", "preseleccionada"].includes(estado)) return null;

  if (confirmar) {
    return (
      <div className="space-y-2 text-sm">
        <p className="font-medium">¿Descartar a este postulante? Le avisaremos que no fue seleccionado.</p>
        <div className="flex gap-2">
          <button type="button" disabled={pendiente} onClick={() => ejecutar("rechazada")}
            className="rounded-lg bg-stone-800 px-4 py-2 font-medium text-white disabled:opacity-60">Sí, descartar</button>
          <button type="button" onClick={() => setConfirmar(false)} className="rounded-lg border border-stone-300 px-4 py-2 font-medium">Volver</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {estado === "preseleccionada" ? (
          <button type="button" disabled={pendiente} onClick={() => ejecutar("en_revision")}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60">
            Quitar de preseleccionados
          </button>
        ) : (
          <button type="button" disabled={pendiente} onClick={() => ejecutar("preseleccionada")}
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60">
            Preseleccionar
          </button>
        )}
        <button type="button" onClick={() => setConfirmar(true)}
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

const MOTIVOS = ["Ya encontramos a la persona", "La necesidad se canceló", "Publicaremos una oferta nueva"];

export function CerrarOferta({ jobId }: { jobId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [resultado, setResultado] = useState<Res>(null);
  const [pendiente, iniciar] = useTransition();

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)}
        className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50">
        Cerrar oferta
      </button>
    );
  }
  return (
    <div className="w-full space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm">
      <label htmlFor="motivo-cierre" className="block font-medium">¿Por qué cierras la oferta?</label>
      <select id="motivo-cierre" value={motivo} onChange={(e) => setMotivo(e.target.value)}
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-700">
        {MOTIVOS.map((m) => <option key={m}>{m}</option>)}
      </select>
      <p className="text-stone-600">Dejará de recibir postulaciones y avisaremos a quienes seguían en proceso.</p>
      {resultado && !resultado.ok && <p role="alert" className="text-red-700">{resultado.texto}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={pendiente}
          onClick={() => iniciar(async () => { const r = await cerrarOferta(jobId, motivo); setResultado({ ok: r.ok, texto: r.mensaje }); })}
          className="rounded-lg bg-stone-800 px-4 py-2 font-medium text-white disabled:opacity-60">
          {pendiente ? "Cerrando..." : "Sí, cerrar"}
        </button>
        <button type="button" onClick={() => setAbierto(false)} className="rounded-lg border border-stone-300 bg-white px-4 py-2 font-medium">Volver</button>
      </div>
    </div>
  );
}
