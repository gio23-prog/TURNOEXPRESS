"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { esUUID } from "@/lib/formato";

type Resultado = { ok: boolean; mensaje: string; errores?: Record<string, string> };

const postulacionSchema = z.object({
  mensaje: z.string().trim().max(500, "Máximo 500 caracteres"),
  experiencia: z.string().trim().max(500, "Máximo 500 caracteres"),
  disponibilidad: z.boolean().refine((v) => v, "Confirma que tienes disponibilidad en el horario de la oferta"),
  // Respuestas a las preguntas de la empresa: { idPregunta: respuesta }. La base valida tipo, opciones y obligatoriedad.
  respuestas: z.record(z.string().uuid(), z.string().trim().max(500, "Máximo 500 caracteres por respuesta")),
});

export type PostulacionInput = z.infer<typeof postulacionSchema>;

// Los errores de reglas de negocio (P0001) ya vienen en español desde la base.
const mensajeDe = (e: { code?: string; message: string }, porDefecto: string) => (e.code === "P0001" ? e.message : porDefecto);

export async function postular(jobId: string, datos: PostulacionInput): Promise<Resultado> {
  if (!esUUID(jobId)) return { ok: false, mensaje: "Oferta no encontrada." };
  const parsed = postulacionSchema.safeParse(datos);
  if (!parsed.success) {
    const errores: Record<string, string> = {};
    for (const i of parsed.error.issues) errores[String(i.path[0])] ??= i.message;
    return { ok: false, mensaje: "Revisa los campos marcados.", errores };
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, mensaje: "Tu sesión expiró. Vuelve a ingresar." };

  const { data: perfil } = await supabase.from("profiles").select("role, full_name").eq("id", auth.user.id).single();
  if (perfil?.role !== "trabajador") return { ok: false, mensaje: "Solo las cuentas de postulante pueden postular." };

  // Perfil profesional mínimo: si aún no existe, se crea con el nombre del registro (nombre + inicial del apellido).
  const { data: wp } = await supabase.from("worker_profiles").select("user_id").eq("user_id", auth.user.id).maybeSingle();
  if (!wp) {
    const [nombre, apellido] = perfil.full_name.trim().split(/\s+/);
    const visible = apellido ? `${nombre} ${apellido[0].toUpperCase()}.` : nombre;
    const { error } = await supabase.from("worker_profiles").insert({ user_id: auth.user.id, display_name: visible });
    if (error) return { ok: false, mensaje: "No pudimos crear tu perfil. Intenta de nuevo." };
  }

  const { mensaje, experiencia, respuestas } = parsed.data;
  const { error } = await supabase.rpc("apply_to_job", {
    p_job: jobId,
    p_availability_confirmed: true,
    p_message: mensaje || null,
    p_highlighted_experience: experiencia || null,
    p_answers: respuestas,
  });
  if (error) return { ok: false, mensaje: mensajeDe(error, "No pudimos enviar tu postulación. Intenta de nuevo.") };

  revalidatePath(`/trabajos/${jobId}`);
  return { ok: true, mensaje: "Postulación enviada. Si la empresa se interesa, te contactará directamente." };
}

export async function retirarPostulacion(jobId: string, applicationId: string): Promise<Resultado> {
  if (!esUUID(jobId) || !esUUID(applicationId)) return { ok: false, mensaje: "Postulación no encontrada." };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, mensaje: "Tu sesión expiró. Vuelve a ingresar." };

  const { error } = await supabase.rpc("withdraw_application", { p_app: applicationId });
  if (error) return { ok: false, mensaje: mensajeDe(error, "No pudimos retirar la postulación.") };

  revalidatePath(`/trabajos/${jobId}`);
  return { ok: true, mensaje: "Retiraste tu postulación." };
}
