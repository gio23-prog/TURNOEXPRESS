"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { faltantesTrabajador } from "@/lib/trabajador";
import { ingresoSchema, erroresPorCampo, type IngresoInput } from "@/lib/schemas/auth";

export async function ingresar(datos: IngresoInput) {
  const parsed = ingresoSchema.safeParse(datos);
  if (!parsed.success) {
    return { ok: false, mensaje: "Revisa los campos marcados.", errores: erroresPorCampo(parsed.error.issues) };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { ok: false, mensaje: "Correo o contraseña incorrectos." };
  }
  // Un trabajador que aún no completa sus datos o su currículum va directo a su perfil.
  const { data: p } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
  if (p?.role === "trabajador" && (await faltantesTrabajador(supabase, data.user.id)).length) redirect("/trabajador/perfil");
  redirect("/");
}