"use client";

// Reemplaza el layout raíz si este falla: no carga los estilos globales, por eso usa estilos en línea.
export default function ErrorGlobal({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="es-CL">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#ffffff", color: "#0f172a" }}>
        <title>Error · Turnoexpress</title>
        <main style={{ maxWidth: 420, margin: "0 auto", padding: "64px 24px", textAlign: "center" }}>
          <p style={{ color: "#0f766e", fontWeight: 600 }}>Turnoexpress</p>
          <h1 style={{ fontSize: 24, margin: "8px 0" }}>Tuvimos un problema</h1>
          <p style={{ color: "#475569" }}>Intenta de nuevo en unos segundos.</p>
          {error.digest && <p style={{ color: "#64748b", fontSize: 12 }}>Código: {error.digest}</p>}
          <button
            type="button"
            onClick={() => retry()}
            style={{ marginTop: 24, background: "#0f766e", color: "#fff", border: 0, borderRadius: 8, padding: "12px 20px", fontSize: 16, cursor: "pointer" }}
          >
            Reintentar
          </button>
        </main>
      </body>
    </html>
  );
}
