import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { diaRelativo, haceTiempo, hora } from "@/lib/formato";
import { GRUPOS_TRABAJADOR, nombreEstado } from "@/lib/estados";
import Encabezado, { obtenerSesion } from "@/app/componentes/encabezado";
import { AnilloAvance, PildoraEstado } from "@/app/componentes/estado";

type Fila = {
  id: string; status: string; created_at: string; updated_at: string;
  job_posts: { id: string; title: string; starts_at: string; ends_at: string; business_id: string; comunas: { name: string } | null } | null;
};

export default async function MisPostulaciones({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/ingresar");
  if (sesion.role !== "trabajador") redirect("/empresa/publicaciones");

  const sp = await searchParams;
  const grupo = GRUPOS_TRABAJADOR.find((g) => g.id === sp.ver) ?? GRUPOS_TRABAJADOR[0];

  const supabase = await createClient();
  const { data } = await supabase
    .from("applications")
    .select("id, status, created_at, updated_at, job_posts(id, title, starts_at, ends_at, business_id, comunas(name))")
    .eq("worker_id", sesion.id)
    .order("updated_at", { ascending: false });
  const todas = (data ?? []) as unknown as Fila[];

  const jobIds = todas.map((f) => f.job_posts?.id).filter(Boolean) as string[];
  const bizIds = [...new Set(todas.map((f) => f.job_posts?.business_id).filter(Boolean))] as string[];
  const [{ data: conteos }, { data: negocios }] = await Promise.all([
    jobIds.length ? supabase.rpc("job_applicant_counts", { p_jobs: jobIds }) : Promise.resolve({ data: [] }),
    bizIds.length ? supabase.from("v_public_businesses").select("user_id, trade_name").in("user_id", bizIds) : Promise.resolve({ data: [] }),
  ]);
  const nPostulantes = new Map((conteos as { job_id: string; applicants: number }[] | null ?? []).map((c) => [c.job_id, Number(c.applicants)]));
  const nombreNegocio = new Map((negocios as { user_id: string; trade_name: string }[] | null ?? []).map((n) => [n.user_id, n.trade_name]));

  const enGrupo = (f: Fila, g: (typeof GRUPOS_TRABAJADOR)[number]) => !g.estados || (g.estados as readonly string[]).includes(f.status);
  const filas = todas.filter((f) => enGrupo(f, grupo));
  const ofertas = todas.filter((f) => f.status === "oferta_enviada").length;

  return (
    <div className="min-h-full bg-stone-50 text-stone-900">
      <Encabezado sesion={sesion} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-2xl font-bold tracking-tight">Mis postulaciones</h1>

        {ofertas > 0 && (
          <Link href="/trabajador/postulaciones?ver=proceso"
            className="mt-4 block rounded-xl border border-amber-300 bg-amber-50 p-4 font-medium text-amber-950 hover:border-amber-500">
            {ofertas === 1 ? "Tienes 1 oferta esperando tu respuesta." : `Tienes ${ofertas} ofertas esperando tu respuesta.`} Ábrela para aceptar o rechazar.
          </Link>
        )}

        <nav aria-label="Filtrar postulaciones" className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {GRUPOS_TRABAJADOR.map((g) => {
            const n = todas.filter((f) => enGrupo(f, g)).length;
            const activo = g.id === grupo.id;
            return (
              <Link key={g.id} href={g.id === "todas" ? "/trabajador/postulaciones" : `/trabajador/postulaciones?ver=${g.id}`}
                aria-current={activo ? "page" : undefined}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium ${
                  activo ? "border-teal-700 bg-teal-700 text-white" : "border-stone-300 bg-white text-stone-700 hover:border-teal-700"}`}>
                {g.nombre} <span className="tabular-nums opacity-75">{n}</span>
              </Link>
            );
          })}
        </nav>

        {filas.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center">
            <p className="font-semibold">{todas.length === 0 ? "Aún no postulas a ningún turno" : "No hay postulaciones en esta pestaña"}</p>
            <Link href="/trabajos" className="mt-3 inline-block font-medium text-teal-800 underline">Buscar turnos</Link>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {filas.map((f) => {
              const j = f.job_posts;
              if (!j) return null;
              const n = nPostulantes.get(j.id);
              return (
                <li key={f.id}>
                  <Link href={`/trabajos/${j.id}`}
                    className="block rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-teal-700 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-lg font-bold leading-snug">{j.title}</h2>
                        <p className="text-sm text-stone-600">
                          {nombreNegocio.get(j.business_id) ?? "Empresa"}{j.comunas?.name && <> · {j.comunas.name}</>}
                        </p>
                        <p className="mt-1 text-sm text-stone-600 tabular-nums first-letter:uppercase">
                          {diaRelativo(j.starts_at)} · {hora(j.starts_at)} a {hora(j.ends_at)}
                        </p>
                      </div>
                      <PildoraEstado estado={f.status} para="trabajador" />
                    </div>
                    <div className="mt-3 flex items-center gap-3 border-t border-stone-100 pt-3">
                      <AnilloAvance estado={f.status} tamano={44} />
                      <div className="text-sm">
                        <p>
                          <span className="font-semibold text-teal-900">{nombreEstado(f.status, "trabajador")}</span>{" "}
                          <span className="text-stone-500">{haceTiempo(f.updated_at)}</span>
                        </p>
                        {n !== undefined && (
                          <p className="text-stone-500 tabular-nums">{n === 1 ? "1 persona postulada" : `${n} personas postuladas`}</p>
                        )}
                      </div>
                    </div>
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
