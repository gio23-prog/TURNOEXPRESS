"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { asegurarPerfilDeRol } from "@/lib/supabase/perfil";
import { mensajeDeError } from "@/lib/supabase/errores";
import { erroresPorCampo } from "@/lib/schemas/auth";
import { postularSchema, type PostularInput } from "@/lib/schemas/postular";

type Resultado = { ok: boolean; mensaje: string; errores?: Record<string, string> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postula con apply_to_job(), que valida rol, perfil, plazo, estado y duplicados. */
export async function postular(jobId: string, datos: PostularInput): Promise<Resultado> {
  if (!UUID.test(jobId)) return { ok: false, mensaje: "Esta publicación no está disponible." };
  const parsed = postularSchema.safeParse(datos);
  if (!parsed.success) {
    return { ok: false, mensaje: "Revisa los campos marcados.", errores: erroresPorCampo(parsed.error.issues) };
  }

  const supabase = await createClient();
  const rol = await asegurarPerfilDeRol(supabase); // apply_to_job exige worker_profiles
  if (rol === null) return { ok: false, mensaje: "Tu sesión expiró. Vuelve a ingresar." };
  if (rol !== "trabajador") return { ok: false, mensaje: "Solo las cuentas de trabajador pueden postular." };

  const { error } = await supabase.rpc("apply_to_job", {
    p_job: jobId,
    p_availability_confirmed: parsed.data.disponible,
    p_message: parsed.data.mensaje || null,
    p_highlighted_experience: parsed.data.experiencia || null,
  });
  if (error) return { ok: false, mensaje: mensajeDeError(error, "No pudimos enviar tu postulación. Intenta de nuevo.") };

  revalidatePath(`/trabajos/${jobId}`);
  revalidatePath("/trabajador/postulaciones");
  return { ok: true, mensaje: "Postulación enviada. La empresa revisará tu perfil y te avisaremos si te hace una oferta." };
}
