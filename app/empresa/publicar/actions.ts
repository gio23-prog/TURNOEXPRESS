"use server";

import { createClient } from "@/lib/supabase/server";
import { empresaCompleta } from "@/lib/empresa";
import { CONDICIONES_VERSION } from "@/lib/condiciones";
import { PREGUNTAS_MODALIDAD, opcionesDe, rangoTurno, requiereAviso, validarTodo, type Borrador } from "@/lib/schemas/publicar";

type Resultado = {
  ok: boolean;
  mensaje: string;
  errores?: Record<string, string>;
  estado?: "publicada" | "en_revision";
};

// Los errores de reglas de negocio (código P0001) ya vienen en español desde la base.
function mensajeDe(error: { code?: string; message: string }, porDefecto: string) {
  return error.code === "P0001" ? error.message : porDefecto;
}

export async function publicarTurno(datos: Borrador): Promise<Resultado> {
  // 1. Misma validación que el formulario (nunca confiar solo en el cliente).
  const errores = validarTodo(datos);
  if (Object.keys(errores).length > 0) {
    return { ok: false, mensaje: "Hay campos por corregir.", errores };
  }

  const supabase = await createClient();

  // 2. Sesión y rol.
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, mensaje: "Tu sesión expiró. Vuelve a ingresar." };

  const { data: perfil } = await supabase.from("profiles").select("role, full_name").eq("id", auth.user.id).single();
  if (!perfil) return { ok: false, mensaje: "No encontramos tu perfil. Vuelve a ingresar." };
  if (perfil.role !== "empresa") return { ok: false, mensaje: "Solo las cuentas de empresa pueden publicar turnos." };

  // 3. Los datos legales de la empresa deben estar completos (la base también lo exige al publicar).
  if (!(await empresaCompleta(supabase, auth.user.id))) {
    return { ok: false, mensaje: "Completa los datos de tu empresa antes de publicar (menú Mi empresa)." };
  }

  // 4. Borrador.
  const { inicio, termino } = rangoTurno(datos);
  const honorarios = datos.contrato === "honorarios";
  const riesgoso = requiereAviso(datos);
  // El cuestionario de modalidad solo se guarda con boleta de honorarios.
  const respuestas = Object.fromEntries(PREGUNTAS_MODALIDAD.map((p) => [p.id, honorarios ? datos.respuestas[p.id] : null]));

  const { data: job, error: errJob } = await supabase
    .from("job_posts")
    .insert({
      business_id: auth.user.id,
      title: datos.titulo.trim(),
      category_id: Number(datos.categoria),
      description: datos.descripcion.trim(),
      slots: Number(datos.cupos),
      starts_at: inicio,
      ends_at: termino,
      modality: "presencial",
      comuna_id: Number(datos.comuna),
      pay_type: datos.modoPago === "total" ? "total" : "por_hora",
      pay_amount_clp: Number(datos.monto),
      breaks_info: datos.pausas.trim() || null,
      attire: datos.vestimenta.trim() || null,
      food_info: datos.alimentacion ? "Incluye alimentación" : null,
      transport_info: datos.transporte ? "Incluye transporte" : null,
      is_urgent: datos.urgente,
      contract_type: datos.contrato,
      labor_warning_ack_at: riesgoso && datos.confirmaAdvertencia ? new Date().toISOString() : null,
      // Aceptación obligatoria de las condiciones del empleador (la base no publica sin ella).
      employer_terms_version: CONDICIONES_VERSION,
      employer_terms_accepted_at: new Date().toISOString(),
      ...respuestas,
    })
    .select("id")
    .single();
  if (errJob || !job) {
    return { ok: false, mensaje: mensajeDe(errJob ?? { message: "" }, "No pudimos guardar el turno. Revisa los datos e intenta de nuevo.") };
  }

  // 5. Dirección exacta (tabla privada: solo la ve quien sea contratado).
  const { error: errDir } = await supabase.from("job_post_private").insert({ job_id: job.id, address_line: datos.direccion.trim() });
  if (errDir) return { ok: false, mensaje: "Guardamos el turno como borrador, pero no la dirección. Intenta de nuevo." };

  // 6. Preguntas para los postulantes (solo se pueden agregar mientras el turno es borrador).
  if (datos.preguntas.length) {
    const filas = datos.preguntas.map((p, i) => ({
      job_id: job.id,
      position: i + 1,
      prompt: p.texto.trim(),
      kind: p.tipo,
      options: p.tipo === "opcion" ? opcionesDe(p) : null,
      required: p.obligatoria,
      disqualifying: p.tipo === "texto" || p.excluyentes.length === 0 ? null : p.excluyentes,
    }));
    const { error: errPreg } = await supabase.from("job_questions").insert(filas);
    if (errPreg) return { ok: false, mensaje: "El turno quedó como borrador, pero no pudimos guardar las preguntas. Revísalas e intenta de nuevo." };
  }

  // 7. Publicar: la base valida reglas, recalcula el riesgo y decide si queda en revisión.
  const { data: estado, error: errPub } = await supabase.rpc("publish_job", { p_job: job.id });
  if (errPub) {
    return { ok: false, mensaje: mensajeDe(errPub, "El turno quedó guardado como borrador, pero no se pudo publicar.") };
  }

  if (estado === "en_revision") {
    // La base deja el motivo en review_note ("Revisión automática: ...").
    const { data: nota } = await supabase.from("job_posts").select("review_note").eq("id", job.id).single();
    const motivo = nota?.review_note?.replace(/^Revisión automática:\s*/, "");
    return {
      ok: true,
      estado,
      mensaje: `Tu turno quedó en revisión${motivo ? ` (motivo: ${motivo})` : ""}. Te avisaremos cuando el equipo lo revise.`,
    };
  }
  return { ok: true, estado: "publicada", mensaje: "Tu turno ya está visible para los trabajadores." };
}
