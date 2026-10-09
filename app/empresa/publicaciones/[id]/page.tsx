import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clp, diaRelativo, esUUID, haceTiempo, hora } from "@/lib/formato";
import { ESTADO_PUBLICACION, GRUPOS_EMPRESA } from "@/lib/estados";
import { nombreContrato } from "@/lib/reglas-publicacion";
import Encabezado, { obtenerSesion } from "@/app/componentes/encabezado";
import { PildoraEstado } from "@/app/componentes/estado";
import { AccionesPostulante } from "./acciones";

type Postulante = {
  id: string; status: string; created_at: string; updated_at: string; worker_id: string;
  message: string | null; highlighted_experience: string | null; disqualified: boolean;
  worker_profiles: { display_name: string; years_experience: number | null; can_issue_boleta: boolean; bio: string | null } | null;
  application_answers: { question_id: string; answer: string }[];
  offers: { status: string; expires_at: string }[];
};
type Pregunta = { id: string; position: number; prompt: string; kind: string; disqualifying: string[] | null };

export default async function PostulantesTurno({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  if (!esUUID(id)) notFound();
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/ingresar");
  const sp = await searchParams;
  const grupo = GRUPOS_EMPRESA.find((g) => g.id === sp.ver) ?? GRUPOS_EMPRESA[0];

  const supabase = await createClient();
  const { data: t } = await supabase
    .from("job_posts")
    .select("id, business_id, title, status, starts_at, ends_at, slots, pay_type, pay_amount_clp, estimated_total_clp, contract_type, review_note, comunas(name)")
    .eq("id", id)
    .eq("business_id", sesion.id)
    .maybeSingle();
  if (!t) notFound();

  const { data: appsRaw } = await supabase
    .from("applications")
    .select(
      "id, status, created_at, updated_at, worker_id, message, highlighted_experience, disqualified, " +
      "worker_profiles(display_name, years_experience, can_issue_boleta, bio), application_answers(question_id, answer), offers(status, expires_at)"
    )
    .eq("job_id", id)
    .order("created_at");
  const postulantes = (appsRaw ?? []) as unknown as Postulante[];

  // Al abrir la lista, los postulantes nuevos pasan a "Perfil visto" (el trabajador lo ve en su línea de estado).
  const nuevos = postulantes.filter((p) => p.status === "pendiente");
  if (nuevos.length) {
    const resultados = await Promise.all(
      nuevos.map((p) => supabase.rpc("set_application_status", { p_app: p.id, p_status: "en_revision" })),
    );
    resultados.forEach((r, k) => { if (!r.error) nuevos[k].status = "en_revision"; });
  }

  const workerIds = postulantes.map((p) => p.worker_id);
  const [{ data: preguntasRaw }, { data: ratings }] = await Promise.all([
    supabase.rpc("my_job_questions", { p_job: id }),
    workerIds.length
      ? supabase.from("v_worker_ratings").select("worker_id, rating_avg, rating_count, services_done").in("worker_id", workerIds)
      : Promise.resolve({ data: [] }),
  ]);
  const preguntas = (preguntasRaw ?? []) as Pregunta[];
  const rating = new Map((ratings as { worker_id: string; rating_avg: number; rating_count: number; services_done: number }[] | null ?? [])
    .map((r) => [r.worker_id, r]));

  const enGrupo = (p: Postulante, g: (typeof GRUPOS_EMPRESA)[number]) => !g.estados || (g.estados as readonly string[]).includes(p.status);
  const lista = postulantes.filter((p) => enGrupo(p, grupo));
  const confirmados = postulantes.filter((p) => ["aceptada", "finalizada"].includes(p.status)).length;
  const comuna = (t.comunas as unknown as { name: string } | null)?.name;

  return (
    <div className="min-h-full bg-stone-50 text-stone-900">
      <Encabezado sesion={sesion} />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Link href="/empresa/publicaciones" className="text-sm font-medium text-teal-800 underline">← Mis turnos</Link>

        <header className="mt-3 rounded-2xl border border-stone-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight text-balance">{t.title}</h1>
              <p className="mt-1 text-stone-600 tabular-nums first-letter:uppercase">
                {diaRelativo(t.starts_at)} · {hora(t.starts_at)} a {hora(t.ends_at)}{comuna && <> · {comuna}</>}
              </p>
              <p className="text-sm text-stone-600">
                {t.pay_type === "total" ? clp(t.pay_amount_clp) + " total" : clp(t.pay_amount_clp) + " por hora"} · {nombreContrato(t.contract_type)}
              </p>
            </div>
            <div className="text-right">
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">{ESTADO_PUBLICACION[t.status] ?? t.status}</span>
              <p className="mt-2 text-sm text-stone-600 tabular-nums">{confirmados} de {t.slots} {t.slots === 1 ? "cupo cubierto" : "cupos cubiertos"}</p>
            </div>
          </div>
          {t.status === "en_revision" && t.review_note && (
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t.review_note}</p>
          )}
          <Link href={`/trabajos/${t.id}`} className="mt-3 inline-block text-sm font-medium text-teal-800 underline">Ver como lo ven los trabajadores</Link>
        </header>

        <nav aria-label="Filtrar postulantes" className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {GRUPOS_EMPRESA.map((g) => {
            const n = postulantes.filter((p) => enGrupo(p, g)).length;
            const activo = g.id === grupo.id;
            return (
              <Link key={g.id} href={g.id === "todos" ? `/empresa/publicaciones/${id}` : `/empresa/publicaciones/${id}?ver=${g.id}`}
                aria-current={activo ? "page" : undefined}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium ${
                  activo ? "border-teal-700 bg-teal-700 text-white" : "border-stone-300 bg-white text-stone-700 hover:border-teal-700"}`}>
                {g.nombre} <span className="tabular-nums opacity-75">{n}</span>
              </Link>
            );
          })}
        </nav>

        {lista.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center">
            <p className="font-semibold">{postulantes.length === 0 ? "Aún no hay postulantes" : "No hay postulantes en esta pestaña"}</p>
            {postulantes.length === 0 && <p className="mt-1 text-sm text-stone-600">Te avisaremos apenas alguien postule.</p>}
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {lista.map((p) => {
              const w = p.worker_profiles;
              const r = rating.get(p.worker_id);
              const ofertaAbierta = p.offers?.find((o) => o.status === "enviada");
              return (
                <li key={p.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-lg font-bold">{w?.display_name ?? "Postulante"}</p>
                      <p className="text-sm text-stone-600">
                        {r ? `${r.rating_avg} ★ (${r.rating_count}) · ${r.services_done} servicios` : "Sin evaluaciones aún"}
                        {w?.years_experience != null && <> · {w.years_experience} años de experiencia</>}
                        {w?.can_issue_boleta && <> · Emite boleta</>}
                      </p>
                      <p className="text-xs text-stone-500">Postuló {haceTiempo(p.created_at).toLowerCase()}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {p.disqualified && (
                        <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800">No cumple requisito</span>
                      )}
                      <PildoraEstado estado={p.status} para="empresa" />
                    </div>
                  </div>

                  {(p.message || p.highlighted_experience) && (
                    <div className="mt-3 space-y-1 text-sm text-stone-700">
                      {p.message && <p className="whitespace-pre-line">{p.message}</p>}
                      {p.highlighted_experience && <p><span className="font-medium">Experiencia: </span>{p.highlighted_experience}</p>}
                    </div>
                  )}

                  {preguntas.length > 0 && (
                    <dl className="mt-3 divide-y divide-stone-100 rounded-xl bg-stone-50 text-sm">
                      {preguntas.map((q) => {
                        const resp = p.application_answers?.find((a) => a.question_id === q.id)?.answer;
                        const excluye = !!resp && !!q.disqualifying?.includes(resp);
                        const texto = q.kind === "si_no" && resp ? (resp === "si" ? "Sí" : "No") : resp;
                        return (
                          <div key={q.id} className="flex flex-col gap-0.5 p-3 sm:flex-row sm:justify-between sm:gap-4">
                            <dt className="text-stone-600">{q.prompt}</dt>
                            <dd className={`font-medium sm:text-right ${excluye ? "text-red-700" : "text-stone-900"}`}>
                              {texto ?? <span className="font-normal text-stone-400">Sin respuesta</span>}
                              {excluye && " · excluyente"}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  )}

                  <div className="mt-4">
                    {ofertaAbierta ? (
                      <p className="text-sm text-amber-900">Oferta enviada. Esperando respuesta hasta las {hora(ofertaAbierta.expires_at)}.</p>
                    ) : p.status === "aceptada" ? (
                      <p className="text-sm font-medium text-emerald-800">Turno confirmado. Ya puede ver la dirección.</p>
                    ) : (
                      <AccionesPostulante jobId={id} applicationId={p.id} estado={p.status} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
