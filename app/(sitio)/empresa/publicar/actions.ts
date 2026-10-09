"use server";

import { createClient } from "@/lib/supabase/server";
import { asegurarPerfilDeRol } from "@/lib/supabase/perfil";
import { diaSiguiente, instanteChile } from "@/lib/fechas";
import { requiereAdvertencia, validarTodo, type Borrador } from "@/lib/schemas/publicar";

type Resultado = { ok: boolean; mensaje: string; errores?: Record<string, string>; borradorId?: string };

// Las RPC lanzan P0001/P0002 con mensajes pensados para el usuario; el resto se oculta.
function mensajeDeError(e: { code?: string; message: string }) {
  return e.code === "P0001" || e.code === "P0002" ? e.message : "No pudimos publicar el turno. Intenta de nuevo.";
}

const textoOpcional = (s: string) => s.trim() || null;

/**
 * Guarda el turno como borrador y lo publica con publish_job(), que valida plan,
 * horario, dirección y modalidad, y lo deja "en revisión" si corresponde.
 * Si la publicación falla, devuelve `borradorId` para reintentar sobre el mismo borrador.
 */
export async function publicarTurno(datos: Borrador, borradorId?: string): Promise<Resultado> {
  // 1. Misma validación que el formulario (nunca confiar solo en el cliente).
  const errores = validarTodo(datos);
  if (Object.keys(errores).length > 0) {
    return { ok: false, mensaje: "Hay campos por corregir.", errores };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, mensaje: "Tu sesión expiró. Vuelve a ingresar." };
  await asegurarPerfilDeRol(supabase);

  // 2. Horario en hora de Chile; si el término es antes del inicio, termina al día siguiente.
  const inicio = instanteChile(datos.fecha, datos.inicio);
  const termino = instanteChile(datos.termino <= datos.inicio ? diaSiguiente(datos.fecha) : datos.fecha, datos.termino);

  const r = datos.respuestas;
  const contenido = {
    title: datos.titulo.trim(),
    category_id: Number(datos.categoria),
    description: datos.descripcion.trim(),
    slots: Number(datos.cupos),
    starts_at: inicio.toISOString(),
    ends_at: termino.toISOString(),
    modality: "presencial",
    comuna_id: Number(datos.comuna),
    pay_type: datos.modoPago === "hora" ? "por_hora" : "total",
    pay_amount_clp: Number(datos.monto),
    breaks_info: textoOpcional(datos.pausas),
    attire: textoOpcional(datos.vestimenta),
    food_info: datos.alimentacion ? "Incluye alimentación" : null,
    transport_info: datos.transporte ? "Incluye transporte" : null,
    is_urgent: datos.urgente,
    q_autonomy: r.q_autonomy,
    q_direct_supervision: r.q_direct_supervision,
    q_imposed_schedule: r.q_imposed_schedule,
    q_continuous_instructions: r.q_continuous_instructions,
    q_core_recurring: r.q_core_recurring,
    q_replaces_staff: r.q_replaces_staff,
    labor_warning_ack_at: requiereAdvertencia(r) && datos.confirmaAdvertencia ? new Date().toISOString() : null,
  };

  // 3. Crear o actualizar el borrador y su dirección privada.
  let id = borradorId;
  if (id) {
    const { error } = await supabase.from("job_posts").update(contenido).eq("id", id).eq("status", "borrador");
    if (error) return { ok: false, mensaje: mensajeDeError(error), borradorId: id };
  } else {
    const { data, error } = await supabase
      .from("job_posts")
      .insert({ ...contenido, business_id: user.id })
      .select("id")
      .single();
    if (error) return { ok: false, mensaje: mensajeDeError(error) };
    id = data.id as string;
  }

  const { error: errDir } = await supabase
    .from("job_post_private")
    .upsert({ job_id: id, address_line: datos.direccion.trim() });
  if (errDir) return { ok: false, mensaje: mensajeDeError(errDir), borradorId: id };

  // 4. Publicar: la base recalcula el riesgo y decide el estado final.
  const { data: estado, error: errPub } = await supabase.rpc("publish_job", { p_job: id });
  if (errPub) return { ok: false, mensaje: mensajeDeError(errPub), borradorId: id };

  return estado === "en_revision"
    ? { ok: true, mensaje: "Tu turno quedó en revisión. Te avisaremos cuando el equipo lo apruebe y sea visible." }
    : { ok: true, mensaje: "Tu turno ya está publicado y visible para quienes buscan trabajo." };
}
