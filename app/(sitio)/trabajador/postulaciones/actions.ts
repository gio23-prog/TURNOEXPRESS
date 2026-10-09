"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mensajeDeError } from "@/lib/supabase/errores";

/** Retira con withdraw_application(), que valida dueño y estado, retira ofertas y avisa a la empresa. */
export async function retirar(appId: string): Promise<{ ok: boolean; mensaje: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_application", { p_app: appId });
  if (error) return { ok: false, mensaje: mensajeDeError(error, "No pudimos retirar la postulación. Intenta de nuevo.") };
  revalidatePath("/trabajador/postulaciones");
  return { ok: true, mensaje: "Postulación retirada." };
}
