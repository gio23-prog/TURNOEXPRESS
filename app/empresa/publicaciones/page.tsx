import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { diaRelativo, hora } from "@/lib/formato";
import { ESTADO_PUBLICACION } from "@/lib/estados";
import Encabezado, { obtenerSesion } from "@/app/componentes/encabezado";

type Turno = {
  id: string; title: string; status: string; starts_at: string; ends_at: string; slots: number;
  comunas: { name: string } | null; applications: { status: string }[];
};

const ACTIVOS = ["publicada", "con_postulaciones", "en_revision", "cubierta", "en_curso", "borrador"];

export default async function MisTurnos({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/ingresar");
  if (sesion.role !== "empresa") redirect("/trabajador/postulaciones");
  const verPasados = (await searchParams).ver === "pasados";

  const supabase = await createClient();
  const { data } = await supabase
    .from("job_posts")
    .select("id, title, status, starts_at, ends_at, slots, comunas(name), applications(status)")
    .eq("business_id", sesion.id)
    .order("starts_at", { ascending: !verPasados });
  const todos = (data ?? []) as unknown as Turno[];
  const turnos = todos.filter((t) => ACTIVOS.includes(t.status) !== verPasados);

  return (
    <div className="min-h-full bg-stone-50 text-stone-900">
      <Encabezado sesion={sesion} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Mis turnos</h1>
          <Link href="/empresa/publicar" className="rounded-lg bg-teal-700 px-4 py-2.5 font-semibold text-white hover:bg-teal-800">
            Publicar turno
          </Link>
        </div>

        <nav aria-label="Filtrar turnos" className="mt-4 flex gap-2">
          {[["", "Activos"], ["pasados", "Pasados"]].map(([v, t]) => {
            const activo = (v === "pasados") === verPasados;
            return (
              <Link key={t} href={v ? `/empresa/publicaciones?ver=${v}` : "/empresa/publicaciones"} aria-current={activo ? "page" : undefined}
                className={`rounded-full border px-4 py-2 text-sm font-medium ${
                  activo ? "border-teal-700 bg-teal-700 text-white" : "border-stone-300 bg-white text-stone-700 hover:border-teal-700"}`}>
                {t}
              </Link>
            );
          })}
        </nav>

        {turnos.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center">
            <p className="font-semibold">{verPasados ? "Aún no tienes turnos pasados" : "No tienes turnos activos"}</p>
            {!verPasados && <Link href="/empresa/publicar" className="mt-3 inline-block font-medium text-teal-800 underline">Publica tu primer turno</Link>}
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {turnos.map((t) => {
              const apps = t.applications ?? [];
              const n = (estados: string[]) => apps.filter((a) => estados.includes(a.status)).length;
              const nuevos = n(["pendiente"]);
              const confirmados = n(["aceptada", "finalizada"]);
              return (
                <li key={t.id}>
                  <Link href={`/empresa/publicaciones/${t.id}`}
                    className="block rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-teal-700 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-lg font-bold leading-snug">{t.title}</h2>
                        <p className="text-sm text-stone-600 tabular-nums first-letter:uppercase">
                          {diaRelativo(t.starts_at)} · {hora(t.starts_at)} a {hora(t.ends_at)}{t.comunas?.name && <> · {t.comunas.name}</>}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
                        {ESTADO_PUBLICACION[t.status] ?? t.status}
                      </span>
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-stone-100 pt-3 text-center text-sm tabular-nums">
                      <div>
                        <dt className="text-stone-500">Postulantes</dt>
                        <dd className="text-lg font-bold">{n(["pendiente", "en_revision", "preseleccionada", "oferta_enviada", "aceptada", "finalizada"])}</dd>
                      </div>
                      <div>
                        <dt className="text-stone-500">Nuevos</dt>
                        <dd className={`text-lg font-bold ${nuevos ? "text-sky-700" : ""}`}>{nuevos}</dd>
                      </div>
                      <div>
                        <dt className="text-stone-500">Confirmados</dt>
                        <dd className="text-lg font-bold">{confirmados} / {t.slots}</dd>
                      </div>
                    </dl>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
