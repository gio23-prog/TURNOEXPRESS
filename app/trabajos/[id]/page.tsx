import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clp, diaRelativo, duracion, esUUID, fecha, hora } from "@/lib/formato";
import Encabezado, { obtenerSesion } from "@/app/componentes/encabezado";
import { BotonRetirar, FormularioPostular } from "./postular";

const ESTADO_POSTULACION: Record<string, string> = {
  pendiente: "Postulación enviada. La empresa aún no la revisa.",
  en_revision: "La empresa está revisando tu postulación.",
  preseleccionada: "¡Te preseleccionaron! La empresa podría enviarte una oferta.",
  oferta_enviada: "Tienes una oferta para este turno.",
  aceptada: "Aceptaste este turno. Está confirmado.",
  rechazada: "Tu postulación no fue seleccionada esta vez.",
  retirada: "Retiraste tu postulación.",
  finalizada: "Este servicio ya finalizó.",
  incidencia_reportada: "Hay una incidencia reportada en este turno.",
};

const ESTADO_PUBLICACION: Record<string, string> = {
  borrador: "Borrador: aún no está publicado.",
  en_revision: "En revisión: nuestro equipo debe aprobarlo antes de mostrarlo.",
  cubierta: "Este turno ya fue cubierto.",
  en_curso: "Este turno está en curso.",
  finalizada: "Este turno ya terminó.",
  cancelada: "Este turno fue cancelado.",
  vencida: "Este turno venció sin cubrirse.",
};

export default async function DetalleTurno({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!esUUID(id)) notFound();

  const sesion = await obtenerSesion();

  if (!sesion) {
    return (
      <div className="min-h-full bg-stone-50 text-stone-900">
        <Encabezado sesion={null} />
        <main className="mx-auto max-w-xl px-4 py-10">
          <h1 className="text-2xl font-bold">Ingresa para ver este turno</h1>
          <p className="mt-2 text-stone-600">Para ver el detalle completo y postular necesitas una cuenta. Es gratis.</p>
          <div className="mt-6 flex gap-3">
            <Link href="/ingresar" className="rounded-lg bg-teal-700 px-5 py-3 font-semibold text-white hover:bg-teal-800">Ingresar</Link>
            <Link href="/registro" className="rounded-lg border border-stone-300 bg-white px-5 py-3 font-semibold">Crear cuenta</Link>
          </div>
        </main>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: t } = await supabase
    .from("job_posts")
    .select(
      "id, business_id, title, description, slots, starts_at, ends_at, duration_minutes, modality, approx_location, " +
        "pay_type, pay_amount_clp, hourly_equivalent_clp, estimated_total_clp, breaks_info, conditions, experience_required, " +
        "certifications_required, attire, food_info, transport_info, additional_requirements, apply_deadline, is_urgent, status, " +
        "category_id, comunas(name, regions(name))"
    )
    .eq("id", id)
    .maybeSingle<Record<string, any>>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!t) notFound();

  const [catRes, negocioRes, postRes, cruceRes] = await Promise.all([
    supabase.from("categories").select("name, parent_id").eq("id", t.category_id).single(),
    supabase.from("v_public_businesses").select("trade_name, verification_status, rating_avg, rating_count").eq("user_id", t.business_id).maybeSingle(),
    sesion.role === "trabajador"
      ? supabase.from("applications").select("id, status").eq("job_id", id).eq("worker_id", sesion.id).maybeSingle()
      : Promise.resolve({ data: null }),
    sesion.role === "trabajador" ? supabase.rpc("my_overlapping_bookings", { p_job: id }) : Promise.resolve({ data: [] }),
  ]);
  const padre = catRes.data?.parent_id
    ? (await supabase.from("categories").select("name").eq("id", catRes.data.parent_id).single()).data?.name
    : null;

  const negocio = negocioRes.data;
  const postulacion = postRes.data as { id: string; status: string } | null;
  const cruces = (cruceRes.data as unknown[] | null)?.length ?? 0;
  const comuna = t.comunas?.name as string | undefined;
  const region = t.comunas?.regions?.name as string | undefined;
  const esDueno = sesion.id === t.business_id;
  const abierto = ["publicada", "con_postulaciones"].includes(t.status) && new Date(t.starts_at) > new Date();
  const horario = `el ${fecha(t.starts_at)} de ${hora(t.starts_at)} a ${hora(t.ends_at)}`;

  const detalles: [string, string | null][] = [
    ["Pausas", t.breaks_info],
    ["Condiciones", t.conditions],
    ["Experiencia requerida", t.experience_required],
    ["Certificaciones", t.certifications_required],
    ["Vestimenta", t.attire],
    ["Alimentación", t.food_info],
    ["Transporte", t.transport_info],
    ["Otros requisitos", t.additional_requirements],
    ["Postular hasta", t.apply_deadline ? `${fecha(t.apply_deadline)} a las ${hora(t.apply_deadline)}` : null],
  ];

  return (
    <div className="min-h-full bg-stone-50 text-stone-900">
      <Encabezado sesion={sesion} />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Link href="/trabajos" className="text-sm font-medium text-teal-800 underline">← Volver a los turnos</Link>

        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_22rem]">
          <article className="min-w-0 space-y-6">
            <header>
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                {padre ? `${padre} · ${catRes.data?.name}` : catRes.data?.name}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold leading-tight text-balance sm:text-3xl">{t.title}</h1>
                {t.is_urgent && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">Urgente</span>}
              </div>
              <p className="mt-1 text-stone-600">
                {negocio?.trade_name ?? "Empresa"}
                {negocio?.verification_status === "verificado" && <span className="font-medium text-teal-800"> · Verificado</span>}
                {negocio?.rating_count ? <> · {negocio.rating_avg} ★ ({negocio.rating_count})</> : null}
              </p>
            </header>

            {!abierto && ESTADO_PUBLICACION[t.status] && (
              <p className="rounded-xl border border-stone-300 bg-stone-100 p-4 text-sm font-medium">{ESTADO_PUBLICACION[t.status]}</p>
            )}

            <dl className="grid grid-cols-2 gap-4 rounded-2xl border border-stone-200 bg-white p-5 text-sm tabular-nums sm:grid-cols-3">
              <div><dt className="text-stone-500">Día</dt><dd className="font-semibold first-letter:uppercase">{diaRelativo(t.starts_at)}</dd></div>
              <div><dt className="text-stone-500">Horario</dt><dd className="font-semibold">{hora(t.starts_at)} a {hora(t.ends_at)}</dd></div>
              <div><dt className="text-stone-500">Duración</dt><dd className="font-semibold">{duracion(t.duration_minutes)}</dd></div>
              <div><dt className="text-stone-500">Pago total</dt><dd className="font-semibold">{clp(t.estimated_total_clp)}</dd></div>
              <div><dt className="text-stone-500">Por hora</dt><dd className="font-semibold">{clp(t.hourly_equivalent_clp)}</dd></div>
              <div><dt className="text-stone-500">Cupos</dt><dd className="font-semibold">{t.slots}</dd></div>
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-stone-500">Lugar</dt>
                <dd className="font-semibold">
                  {t.modality === "remoto" ? "Remoto" : [comuna, region].filter(Boolean).join(", ")}
                  {t.approx_location && <span className="font-normal text-stone-600"> · {t.approx_location}</span>}
                </dd>
                {t.modality !== "remoto" && (
                  <dd className="mt-1 text-xs text-stone-500">La dirección exacta se comparte solo con quien sea contratado.</dd>
                )}
              </div>
            </dl>

            <section>
              <h2 className="text-lg font-bold">Qué hay que hacer</h2>
              <p className="mt-2 max-w-prose whitespace-pre-line text-stone-700">{t.description}</p>
            </section>

            {detalles.some(([, v]) => v) && (
              <section>
                <h2 className="text-lg font-bold">Detalles</h2>
                <dl className="mt-2 divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white text-sm">
                  {detalles.filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} className="flex flex-col gap-1 p-3 sm:flex-row sm:justify-between sm:gap-4">
                      <dt className="text-stone-500">{k}</dt>
                      <dd className="font-medium sm:text-right">{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </article>

          <aside className="lg:self-start">
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              {esDueno ? (
                <>
                  <p className="font-semibold">Este turno es tuyo</p>
                  <p className="mt-1 text-sm text-stone-600">Pronto podrás ver y elegir postulantes desde tu panel.</p>
                </>
              ) : sesion.role === "empresa" ? (
                <p className="text-sm text-stone-600">Estás viendo este turno con una cuenta de empresa. Para postular necesitas una cuenta de trabajador.</p>
              ) : postulacion ? (
                <div className="space-y-3">
                  <p className="font-semibold">Tu postulación</p>
                  <p className="text-sm text-stone-700">{ESTADO_POSTULACION[postulacion.status] ?? postulacion.status}</p>
                  {["pendiente", "en_revision", "preseleccionada"].includes(postulacion.status) && (
                    <BotonRetirar jobId={id} applicationId={postulacion.id} />
                  )}
                </div>
              ) : abierto ? (
                <>
                  <h2 className="mb-3 text-lg font-bold">Postular a este turno</h2>
                  {cruces > 0 && (
                    <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                      Ya tienes un turno confirmado que se cruza con este horario. Puedes postular, pero no podrás aceptar ambos.
                    </p>
                  )}
                  <FormularioPostular jobId={id} horario={horario} />
                </>
              ) : (
                <p className="text-sm text-stone-600">Este turno ya no recibe postulaciones.</p>
              )}
            </div>
            <p className="mt-3 px-1 text-xs text-stone-500">
              Postular es gratis. Antes de confirmar verás todas las condiciones del servicio.
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}
