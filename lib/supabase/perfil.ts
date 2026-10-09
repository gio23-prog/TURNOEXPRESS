import type { SupabaseClient } from "@supabase/supabase-js";

export type Rol = "trabajador" | "empresa";

/** Rol de la cuenta con sesión iniciada, o null si no hay sesión o perfil. */
export async function obtenerRol(supabase: SupabaseClient): Promise<Rol | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return (data?.role as Rol | undefined) ?? null;
}

/** Pantalla de inicio de cada rol después de ingresar. */
export function inicioSegunRol(rol: Rol | null): string {
  if (rol === "empresa") return "/empresa/publicar";
  if (rol === "trabajador") return "/trabajos";
  return "/";
}

/**
 * Crea el perfil de empresa o de trabajador si aún no existe y devuelve el rol
 * (profiles.role). Se llama al iniciar sesión: el alta (handle_new_user) solo crea
 * `profiles`, y sin `business_profiles` una empresa no puede publicar. Errores al
 * crear el perfil se ignoran para no bloquear el ingreso.
 */
export async function asegurarPerfilDeRol(supabase: SupabaseClient): Promise<Rol | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: perfil } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
  if (!perfil) return null;

  if (perfil.role === "empresa") {
    const { data: existe } = await supabase.from("business_profiles").select("user_id").eq("user_id", user.id).maybeSingle();
    if (!existe) await supabase.from("business_profiles").insert({ user_id: user.id, trade_name: perfil.full_name });
  } else {
    const { data: existe } = await supabase.from("worker_profiles").select("user_id").eq("user_id", user.id).maybeSingle();
    // display_name admite hasta 60 caracteres; full_name hasta 120.
    if (!existe) await supabase.from("worker_profiles").insert({ user_id: user.id, display_name: perfil.full_name.slice(0, 60) });
  }
  return perfil.role as Rol;
}
