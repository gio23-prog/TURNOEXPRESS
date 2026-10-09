"use client";

import { useState, useTransition } from "react";
import { retirar } from "./actions";

export default function Retirar({ appId }: { appId: string }) {
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  return (
    <div>
      <button
        type="button"
        disabled={pendiente}
        onClick={() => {
          if (!confirm("¿Retirar esta postulación? La empresa ya no podrá ofrecerte el turno.")) return;
          iniciar(async () => {
            const r = await retirar(appId);
            setError(r.ok ? "" : r.mensaje);
          });
        }}
        className="text-sm font-medium text-red-700 underline disabled:opacity-60"
      >
        {pendiente ? "Retirando..." : "Retirar postulación"}
      </button>
      {error && <p role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}
