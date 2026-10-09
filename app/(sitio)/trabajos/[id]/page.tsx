import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerRol } from "@/lib/supabase/perfil";
import { clp, duracion, ESTADO_POSTULACION, horario } from "@/lib/formato";
import Postular from "./postular";

export const metadata: Metadata = { title: "Detalle del turno" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Solo columnas públicas: nunca el cuestionario de modalidad, notas de revisión
// ni la dirección exacta (esta vive en job_post_private).
const COLUMNAS = `id, title, description, slots, starts_at, ends_at, duration_minutes, approx_location,
  pay_type, pay_amount_clp, hourly_equivalent_clp, estimated_total_clp, breaks_info, conditions,
  experience_required, certifications_required, attire, food_info, transport_info, additional_requirements,
  apply_deadline, is_urgent, status, business_id,
  category:categories(name), comuna:comunas(name)`;

const LISTADA = ["publicada", "con_postulaciones"];

export default async function DetalleTurno({ params }: PageProps<"/trabajos/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/ingresar"); // job_posts no es legible sin sesión

  const { data: t } = await supabase.from("job_posts").select(COLUMNAS).eq("id", id).maybeSingle();
  if (!t) notFound(); // RLS: solo publicaciones visibles, propias o a las que postulaste

  const [rol, { data: empresa }, { data: requisitos }, { data: postulacion }, { data: choques }] = await Promise.all([
    obtenerRol(supabase),
    supabase.from("v_public_businesses").select("trade_name, verification_status, rating_avg, rating_count")
      .eq("user_id", t.business_id).maybeSingle(),
    supabase.from("job_requirements").select("id, kind, description, is_mandatory").eq("job_id", id),
    supabase.from("applications").select("status, created_at").eq("job_id", id).eq("worker_id", user.id).maybeSingle(),
    supabase.rpc("my_overlapping_bookings", { p_job: id }),
  ]);

  const categoria = (t.category as unknown as { name: string } | null)?.name;
  const comuna = (t.comuna as unknown as { name: string } | null)?.name;
  const abierta = LISTADA.includes(t.status) && new Date(t.starts_at) > new Date()
    && (!t.apply_deadline || new Date(t.apply_deadline) > new Date());
  const hayChoque = Array.isArray(choques) && choques.length > 0;

  const detalles: [string, string | null][] = [
    ["Pausas", t.breaks_info],
    ["Vestimenta", t.attire],
    ["Alimentación", t.food_info],
    ["Transporte", t.transport_info],
    ["Experiencia requerida", t.experience_required],
    ["Certificaciones", t.certifications_required],
    ["Otros requisitos", t.additional_requirements],
    ["Condiciones", t.conditions],
  ];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-8">
      <Link href="/trabajos" className="text-sm font-medium text-turquesa-oscuro underline">← Volver a la búsqueda</Link>

      <div className="mt-4 flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold text-marino">{t.title}</h1>
        {t.is_urgent && <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">Urgente</span>}
      </div>
      <p className="mt-1 text-texto-suave">
        {empresa?.trade_name ?? "Empresa"}
        {empresa?.verification_status === "verificado" && <span className="ml-1 text-turquesa-oscuro">· Verificada</span>}
        {empresa?.rating_count ? <span> · ★ {empresa.rating_avg} ({empresa.rating_count})</span> : null}
      </p>

      <dl className="mt-6 divide-y divide-borde rounded-lg border border-borde text-sm">
        {[
          ["Cuándo", `${horario(t.starts_at, t.ends_at)} (${duracion(t.duration_minutes)})`],
          ["Dónde", [comuna, t.approx_location].filter(Boolean).join(" · ") || "Por confirmar"],
          ["Pago", `${clp(t.estimated_total_clp)} en total · ${clp(t.hourly_equivalent_clp)} por hora`],
          ["Categoría", categoria ?? ""],
          ["Cupos", String(t.slots)],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 p-3">
            <dt className="text-texto-suave">{k}</dt>
            <dd className="text-right font-medium text-marino">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-texto-tenue">La dirección exacta se comparte solo con quien sea contratado.</p>

      <section className="mt-6">
        <h2 className="font-medium text-marino">Descripción</h2>
        <p className="mt-2 whitespace-pre-line text-texto-suave">{t.description}</p>
      </section>

      {(detalles.some(([, v]) => v) || (requisitos?.length ?? 0) > 0) && (
        <section className="mt-6">
          <h2 className="font-medium text-marino">Condiciones y requisitos</h2>
          <ul className="mt-2 space-y-1 text-sm text-texto-suave">
            {detalles.filter(([, v]) => v).map(([k, v]) => <li key={k}><span className="font-medium text-marino">{k}:</span> {v}</li>)}
            {(requisitos ?? []).map((r) => (
              <li key={r.id}>{r.description}{r.is_mandatory ? "" : " (deseable)"}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8 rounded-lg border border-borde bg-fondo-suave p-4">
        {postulacion ? (
          <p className="text-sm text-marino">
            Ya postulaste a este turno. Estado: <strong>{ESTADO_POSTULACION[postulacion.status] ?? postulacion.status}</strong>.{" "}
            <Link href="/trabajador/postulaciones" className="font-medium text-turquesa-oscuro underline">Ver mis postulaciones</Link>
          </p>
        ) : !abierta ? (
          <p className="text-sm text-texto-suave">Este turno ya no recibe postulaciones.</p>
        ) : rol === "trabajador" ? (
          <>
            <h2 className="mb-3 font-medium text-marino">Postular a este turno</h2>
            <Postular jobId={t.id} aviso={hayChoque ? "Este horario se cruza con un turno que ya tienes confirmado." : undefined} />
          </>
        ) : (
          <p className="text-sm text-texto-suave">Solo las cuentas de trabajador pueden postular.</p>
        )}
      </section>
    </main>
  );
}
