"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { asegurarPerfilDeRol, inicioSegunRol } from "@/lib/supabase/perfil";
import { registroSchema, erroresPorCampo, type RegistroInput } from "@/lib/schemas/auth";

type Resultado = { ok: boolean; mensaje: string; errores?: Record<string, string> };

export async function registrar(datos: RegistroInput): Promise<Resultado> {
  const parsed = registroSchema.safeParse(datos);
  if (!parsed.success) {
    return { ok: false, mensaje: "Revisa los campos marcados.", errores: erroresPorCampo(parsed.error.issues) };
  }
  const { email, password, nombre, tipo } = parsed.data;
  // URL pública fija si está configurada; si no, la del navegador que hizo la solicitud.
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? (await headers()).get("origin") ?? "";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      // Deben coincidir con lo que lee public.handle_new_user() (migración core).
      data: { full_name: nombre, role: tipo, accepted_terms: true, accepted_privacy: true, is_adult: true },
    },
  });

  if (error) {
    return { ok: false, mensaje: "No pudimos crear la cuenta. Revisa los datos o intenta con otro correo." };
  }
  // Si el proyecto no exige confirmar el correo, la sesión ya existe: entra directo.
  if (data.session) redirect(inicioSegunRol(await asegurarPerfilDeRol(supabase)));
  return { ok: true, mensaje: "Cuenta creada. Revisa tu correo para confirmarla y luego ingresa." };
}