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

/** Preseleccionar, volver a revisión o descartar a un postulante (la base valida qué cambios están permitidos). */
export async function cambiarEstado(
  jobId: string, applicationId: string, estado: "preseleccionada" | "en_revision" | "rechazada",
): Promise<Resultado> {
  if (!esUUID(jobId) || !esUUID(applicationId)) return { ok: false, mensaje: "Postulación no encontrada." };
  const { supabase, ok } = await sesionEmpresa();
  if (!ok) return { ok: false, mensaje: "Tu sesión expiró. Vuelve a ingresar." };
  const { error } = await supabase.rpc("set_application_status", { p_app: applicationId, p_status: estado });
  if (error) return { ok: false, mensaje: mensajeDe(error, "No pudimos actualizar la postulación.") };
  revalidatePath(`/empresa/publicaciones/${jobId}`);
  return { ok: true, mensaje: estado === "preseleccionada" ? "Preseleccionado." : estado === "rechazada" ? "Descartado." : "Listo." };
}

/** Cerrar la oferta: deja de recibir postulaciones y avisa a quienes seguían en proceso. */
export async function cerrarOferta(jobId: string, motivo: string): Promise<Resultado> {
  if (!esUUID(jobId)) return { ok: false, mensaje: "Oferta no encontrada." };
  if (motivo.trim().length < 5) return { ok: false, mensaje: "Indica el motivo del cierre." };
  const { supabase, ok } = await sesionEmpresa();
  if (!ok) return { ok: false, mensaje: "Tu sesión expiró. Vuelve a ingresar." };
  const { error } = await supabase.rpc("cancel_job", { p_job: jobId, p_reason: motivo.trim().slice(0, 300) });
  if (error) return { ok: false, mensaje: mensajeDe(error, "No pudimos cerrar la oferta.") };
  revalidatePath(`/empresa/publicaciones/${jobId}`);
  revalidatePath("/empresa/publicaciones");
  return { ok: true, mensaje: "Oferta cerrada." };
}
