"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { asegurarPerfilDeRol } from "@/lib/supabase/perfil";
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
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      // Deben coincidir con lo que lee public.handle_new_user() (migración core).
      data: { full_name: nombre, role: tipo, accepted_terms: true, accepted_privacy: true },
    },
  });

  if (error) {
    return { ok: false, mensaje: "No pudimos crear la cuenta. Revisa los datos o intenta con otro correo." };
  }
  // Si el proyecto no exige confirmar el correo, la sesión ya existe.
  if (data.session) await asegurarPerfilDeRol(supabase);
  return { ok: true, mensaje: "Cuenta creada. Revisa tu correo para confirmarla y luego ingresa." };
}