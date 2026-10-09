"use server";

import { createClient } from "@/lib/supabase/server";
import { PREGUNTAS_MODALIDAD, rangoTurno, requiereAviso, validarTodo, type Borrador } from "@/lib/schemas/publicar";

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

  // 3. Perfil de negocio: si aún no existe, se crea con el nombre del registro.
  const { data: negocio } = await supabase.from("business_profiles").select("user_id").eq("user_id", auth.user.id).maybeSingle();
  if (!negocio) {
    const { error } = await supabase
      .from("business_profiles")
      .insert({ user_id: auth.user.id, trade_name: perfil.full_name, comuna_id: Number(datos.comuna) });
    if (error) return { ok: false, mensaje: "No pudimos crear el perfil de tu negocio. Intenta de nuevo." };
  }

  // 4. Borrador.
  const { inicio, termino } = rangoTurno(datos);
  const riesgoso = requiereAviso(datos.respuestas);
  const respuestas = Object.fromEntries(PREGUNTAS_MODALIDAD.map((p) => [p.id, datos.respuestas[p.id]]));

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
      engagement_mode: "por_definir",
      labor_warning_ack_at: riesgoso && datos.confirmaAdvertencia ? new Date().toISOString() : null,
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

  // 6. Publicar: la base valida reglas, recalcula el riesgo y decide si queda en revisión.
  const { data: estado, error: errPub } = await supabase.rpc("publish_job", { p_job: job.id });
  if (errPub) {
    return { ok: false, mensaje: mensajeDe(errPub, "El turno quedó guardado como borrador, pero no se pudo publicar.") };
  }

  return estado === "en_revision"
    ? { ok: true, estado, mensaje: "Tu turno quedó en revisión. Por sus condiciones podría corresponder a una relación laboral; te avisaremos cuando el equipo lo revise." }
    : { ok: true, estado: "publicada", mensaje: "Tu turno ya está visible para los trabajadores." };
}
