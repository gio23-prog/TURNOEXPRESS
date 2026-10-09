import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ESTADO_POSTULACION, ESTADOS_RETIRABLES, horario } from "@/lib/formato";
import Retirar from "./retirar";

export const metadata: Metadata = { title: "Mis postulaciones" };

type Fila = {
  id: string;
  status: string;
  created_at: string;
  job: { id: string; title: string; starts_at: string; ends_at: string; comuna: { name: string } | null } | null;
};

export default async function MisPostulaciones() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/ingresar"); // el layout también lo exige, pero corre en paralelo

  // RLS (party_read) ya limita a las propias; el filtro explícito evita depender solo de ello.
  const { data, error } = await supabase
    .from("applications")
    .select("id, status, created_at, job:job_posts(id, title, starts_at, ends_at, comuna:comunas(name))")
    .eq("worker_id", user.id)
    .order("created_at", { ascending: false });
  const filas = (data ?? []) as unknown as Fila[];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-8">
      <h1 className="text-2xl font-semibold text-marino">Mis postulaciones</h1>

      {error ? (
        <p className="mt-6 rounded-lg border border-borde bg-fondo-suave p-4 text-sm text-texto-suave">
          No pudimos cargar tus postulaciones. Intenta de nuevo en unos minutos.
        </p>
      ) : filas.length === 0 ? (
        <p className="mt-6 rounded-lg border border-borde bg-fondo-suave p-4 text-sm text-texto-suave">
          Aún no has postulado a ningún turno.{" "}
          <Link href="/trabajos" className="font-medium text-turquesa-oscuro underline">Buscar turnos</Link>
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {filas.map((a) => (
            <li key={a.id} className="rounded-lg border border-borde p-4">
              <div className="flex items-start justify-between gap-3">
                {a.job ? (
                  <Link href={`/trabajos/${a.job.id}`} className="font-medium text-marino hover:underline">{a.job.title}</Link>
                ) : (
                  <span className="font-medium text-marino">Publicación no disponible</span>
                )}
                <span className="shrink-0 rounded-full bg-turquesa-claro px-2 py-0.5 text-xs font-medium text-turquesa-oscuro">
                  {ESTADO_POSTULACION[a.status] ?? a.status}
                </span>
              </div>
              {a.job && (
                <p className="mt-1 text-sm text-texto-suave">
                  {horario(a.job.starts_at, a.job.ends_at)}{a.job.comuna ? ` · ${a.job.comuna.name}` : ""}
                </p>
              )}
              {a.status === "oferta_enviada" && (
                <p className="mt-2 text-sm text-marino">La empresa quiere contactarte. Pronto podrás responderle desde aquí.</p>
              )}
              {ESTADOS_RETIRABLES.includes(a.status) && <div className="mt-3"><Retirar appId={a.id} /></div>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
