"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { esUUID } from "@/lib/formato";

type Resultado = { ok: boolean; mensaje: string };

const mensajeDe = (e: { code?: string; message: string }, porDefecto: string) => (e.code === "P0001" ? e.message : porDefecto);

async function sesionEmpresa() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  return { supabase, ok: !!auth.user };
}

/** Preseleccionar o descartar a un postulante (la base valida qué cambios están permitidos). */
export async function cambiarEstado(jobId: string, applicationId: string, estado: "preseleccionada" | "rechazada"): Promise<Resultado> {
  if (!esUUID(jobId) || !esUUID(applicationId)) return { ok: false, mensaje: "Postulación no encontrada." };
  const { supabase, ok } = await sesionEmpresa();
  if (!ok) return { ok: false, mensaje: "Tu sesión expiró. Vuelve a ingresar." };
  const { error } = await supabase.rpc("set_application_status", { p_app: applicationId, p_status: estado });
  if (error) return { ok: false, mensaje: mensajeDe(error, "No pudimos actualizar la postulación.") };
  revalidatePath(`/empresa/publicaciones/${jobId}`);
  return { ok: true, mensaje: estado === "preseleccionada" ? "Preseleccionado." : "Descartado." };
}

export async function enviarOferta(jobId: string, applicationId: string, mensaje: string): Promise<Resultado> {
  if (!esUUID(jobId) || !esUUID(applicationId)) return { ok: false, mensaje: "Postulación no encontrada." };
  if (mensaje.length > 500) return { ok: false, mensaje: "El mensaje puede tener máximo 500 caracteres." };
  const { supabase, ok } = await sesionEmpresa();
  if (!ok) return { ok: false, mensaje: "Tu sesión expiró. Vuelve a ingresar." };
  const { error } = await supabase.rpc("send_offer", { p_app: applicationId, p_message: mensaje.trim() || null });
  if (error) return { ok: false, mensaje: mensajeDe(error, "No pudimos enviar la oferta.") };
  revalidatePath(`/empresa/publicaciones/${jobId}`);
  return { ok: true, mensaje: "Oferta enviada. Te avisaremos cuando responda." };
}
