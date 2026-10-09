import type { SupabaseClient } from "@supabase/supabase-js";
import { nombreVisiblePorDefecto } from "@/lib/schemas/trabajador";

type Datos = { nombre: string; telefono: string; rut: string; comuna: string; direccion: string };

/** Guarda datos personales (perfil, dirección privada) y crea el perfil profesional si no existe. */
export async function guardarDatosPersonales(supabase: SupabaseClient, uid: string, d: Datos) {
  const { error: e1 } = await supabase.from("profiles").update({ full_name: d.nombre, phone: d.telefono, rut: d.rut }).eq("id", uid);
  if (e1) {
    return e1.code === "23505"
      ? { ok: false, mensaje: "Ese RUT ya está registrado en otra cuenta.", errores: { rut: "Este RUT ya está registrado" } }
      : { ok: false, mensaje: "No pudimos guardar tus datos. Revisa la información." };
  }
  const fila = { address_line: d.direccion, comuna_id: Number(d.comuna) };
  const { data: existe } = await supabase.from("worker_private").select("user_id").eq("user_id", uid).maybeSingle();
  const { error: e2 } = existe
    ? await supabase.from("worker_private").update(fila).eq("user_id", uid)
    : await supabase.from("worker_private").insert({ user_id: uid, ...fila });
  if (e2) return { ok: false, mensaje: "No pudimos guardar tu dirección. Intenta de nuevo." };

  const { data: wp } = await supabase.from("worker_profiles").select("user_id").eq("user_id", uid).maybeSingle();
  if (!wp) {
    const { error: e3 } = await supabase.from("worker_profiles").insert({ user_id: uid, display_name: nombreVisiblePorDefecto(d.nombre) });
    if (e3) return { ok: false, mensaje: "No pudimos crear tu perfil. Intenta de nuevo." };
  }
  return { ok: true, mensaje: "Datos guardados." };
}

/** Qué le falta al trabajador para poder postular. */
export async function faltantesTrabajador(supabase: SupabaseClient, uid: string) {
  const [{ data: p }, { data: priv }, { data: wp }] = await Promise.all([
    supabase.from("profiles").select("phone, rut").eq("id", uid).single(),
    supabase.from("worker_private").select("user_id").eq("user_id", uid).maybeSingle(),
    supabase.from("worker_profiles").select("cv_path").eq("user_id", uid).maybeSingle(),
  ]);
  const faltan: string[] = [];
  if (!p?.phone || !p?.rut || !priv) faltan.push("datos personales");
  if (!wp?.cv_path) faltan.push("currículum");
  return faltan;
}
