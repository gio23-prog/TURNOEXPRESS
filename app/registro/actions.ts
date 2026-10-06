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
      // TODO: estos nombres y valores deben coincidir con lo que lee tu trigger de alta
      // en la migración (rol y consentimiento). Ajusta si tu trigger espera otros.
      data: { full_name: nombre, role: tipo, consent: true, consent_at: new Date().toISOString() },
    },
  });

  if (error) {
    return { ok: false, mensaje: "No pudimos crear la cuenta. Revisa los datos o intenta con otro correo." };
  }
  return { ok: true, mensaje: "Cuenta creada. Revisa tu correo para confirmarla y luego ingresa." };
}