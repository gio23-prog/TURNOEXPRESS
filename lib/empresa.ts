import type { SupabaseClient } from "@supabase/supabase-js";

// Mismos campos que exige business_profile_missing() en la base.
const OBLIGATORIOS = ["rut", "legal_name", "giro", "fiscal_address", "comuna_id", "legal_rep_name", "legal_rep_rut", "contact_name", "contact_phone"] as const;

export async function empresaCompleta(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from("business_profiles").select(OBLIGATORIOS.join(", ")).eq("user_id", userId).maybeSingle();
  if (!data) return false;
  const fila = data as unknown as Record<string, unknown>;
  return OBLIGATORIOS.every((k) => fila[k] !== null && fila[k] !== "");
}

export const RUTA_COMPLETAR_EMPRESA = "/empresa/perfil?completar=1&destino=/empresa/publicar";
