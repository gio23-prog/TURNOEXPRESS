"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { RUTA_COMPLETAR_EMPRESA } from "@/lib/empresa";
import { registroSchema, erroresPorCampo, type RegistroInput } from "@/lib/schemas/auth";
import { filaEmpresa, registroEmpresaSchema, type RegistroEmpresaInput } from "@/lib/schemas/empresa";

type Resultado = { ok: boolean; mensaje: string; errores?: Record<string, string>; destino?: string };

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
      // Deben coincidir con lo que exige handle_new_user() en la migración core:
      // sin accepted_terms y accepted_privacy en true, la base rechaza el registro.
      data: { full_name: nombre, role: tipo, accepted_terms: true, accepted_privacy: true },
    },
  });

  if (error) {
    return { ok: false, mensaje: "No pudimos crear la cuenta. Revisa los datos o intenta con otro correo." };
  }
  // Si Supabase no exige confirmar el correo, la sesión queda abierta y seguimos al siguiente paso.
  if (data.session) {
    return { ok: true, mensaje: "Cuenta creada.", destino: tipo === "empresa" ? RUTA_COMPLETAR_EMPRESA : "/trabajos" };
  }
  return { ok: true, mensaje: "Cuenta creada. Revisa tu correo para confirmarla y luego ingresa." };
}
/**
 * Registro de empresa en un paso (como en los portales de empleo):
 * valida todo, verifica que el RUT esté libre, crea la cuenta y, si queda con sesión,
 * guarda los datos de la empresa de inmediato. Los datos legales NO viajan en los metadatos
 * de la cuenta (que se copian a la sesión del navegador).
 */
export async function registrarEmpresa(datos: RegistroEmpresaInput): Promise<Resultado> {
  const parsed = registroEmpresaSchema.safeParse(datos);
  if (!parsed.success) {
    return { ok: false, mensaje: "Revisa los campos marcados.", errores: erroresPorCampo(parsed.error.issues) };
  }
  const d = parsed.data;
  const supabase = await createClient();

  const { data: libre, error: errRut } = await supabase.rpc("rut_empresa_disponible", { p_rut: d.rutEmpresa });
  if (errRut) return { ok: false, mensaje: "No pudimos verificar el RUT. Intenta de nuevo en un momento." };
  if (!libre) {
    return {
      ok: false,
      mensaje: "Ese RUT de empresa ya tiene una cuenta. Si es tuya, ingresa con ella.",
      errores: { rutEmpresa: "Este RUT ya está registrado" },
    };
  }

  const origin = (await headers()).get("origin") ?? "";
  const { data, error } = await supabase.auth.signUp({
    email: d.contactoCorreo,
    password: d.password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: { full_name: d.contactoNombre, role: "empresa", accepted_terms: true, accepted_privacy: true },
    },
  });
  if (error) {
    return { ok: false, mensaje: "No pudimos crear la cuenta. Puede que ese correo ya esté registrado.", errores: { contactoCorreo: "Revisa este correo" } };
  }

  if (!data.session) {
    // Supabase exige confirmar el correo: los datos de la empresa se piden al primer ingreso.
    return { ok: true, mensaje: "Cuenta creada. Revisa tu correo para confirmarla; al ingresar te pediremos confirmar los datos de la empresa." };
  }

  const { error: errEmp } = await supabase.from("business_profiles").insert({ user_id: data.session.user.id, ...filaEmpresa(d) });
  if (errEmp) {
    // La cuenta ya existe: se termina de completar en el perfil de empresa.
    return { ok: true, mensaje: "Cuenta creada.", destino: RUTA_COMPLETAR_EMPRESA };
  }
  return { ok: true, mensaje: "Cuenta creada.", destino: "/empresa/publicar" };
}
