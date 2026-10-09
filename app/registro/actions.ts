"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { registroSchema, erroresPorCampo, type RegistroInput } from "@/lib/schemas/auth";

type Resultado = { ok: boolean; mensaje: string; errores?: Record<string, string> };

export async function registrar(datos: RegistroInput): Promise<Resultado> {
  const parsed = registroSchema.safeParse(datos);
  if (!parsed.success) {
    return { ok: false, mensaje: "Revisa los campos marcados.", errores: erroresPorCampo(parsed.error.issues) };
  }
  const { email, password, nombre, tipo } = parsed.data;
  const origin = (await headers()).get("origin") ?? "";

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      // Deben coincidir con lo que exige handle_new_user() en la migración core:
      // sin accepted_terms y accepted_privacy en true, la base rechaza el registro.
      data: { full_name: nombre, role: tipo, accepted_terms: true, accepted_privacy: true },
    },
  });

  if (error) {
    return { ok: false, mensaje: "No pudimos crear la cuenta. Revisa los datos o intenta con otro correo." };
  }
  return { ok: true, mensaje: "Cuenta creada. Revisa tu correo para confirmarla y luego ingresa." };
}