"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ingresoSchema, erroresPorCampo, type IngresoInput } from "@/lib/schemas/auth";

export async function ingresar(datos: IngresoInput) {
  const parsed = ingresoSchema.safeParse(datos);
  if (!parsed.success) {
    return { ok: false, mensaje: "Revisa los campos marcados.", errores: erroresPorCampo(parsed.error.issues) };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { ok: false, mensaje: "Correo o contraseña incorrectos." };
  }
  redirect("/");
}