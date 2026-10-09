"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { empresaSchema, type EmpresaInput } from "@/lib/schemas/empresa";

type Resultado = { ok: boolean; mensaje: string; errores?: Record<string, string> };

export async function guardarEmpresa(datos: EmpresaInput): Promise<Resultado> {
  const parsed = empresaSchema.safeParse(datos);
  if (!parsed.success) {
    const errores: Record<string, string> = {};
    for (const i of parsed.error.issues) errores[String(i.path[0])] ??= i.message;
    return { ok: false, mensaje: "Revisa los campos marcados.", errores };
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, mensaje: "Tu sesión expiró. Vuelve a ingresar." };

  const { data: perfil } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  if (perfil?.role !== "empresa") return { ok: false, mensaje: "Solo las cuentas de empresa tienen datos de empresa." };

  const d = parsed.data;
  const fila = {
    trade_name: d.nombreComercial,
    legal_name: d.razonSocial,
    rut: d.rutEmpresa,
    giro: d.giro,
    business_type: d.rubro || null,
    description: d.descripcion || null,
    comuna_id: Number(d.comuna),
    fiscal_address: d.direccionFiscal,
    legal_rep_name: d.repNombre,
    legal_rep_rut: d.repRut,
    contact_name: d.contactoNombre,
    contact_position: d.contactoCargo,
    contact_phone: d.contactoTelefono,
    contact_email: d.contactoCorreo,
  };

  const { data: existe } = await supabase.from("business_profiles").select("user_id").eq("user_id", auth.user.id).maybeSingle();
  const { error } = existe
    ? await supabase.from("business_profiles").update(fila).eq("user_id", auth.user.id)
    : await supabase.from("business_profiles").insert({ user_id: auth.user.id, ...fila });

  if (error) {
    // 23505 = RUT ya registrado por otra empresa (índice único).
    if (error.code === "23505") {
      return { ok: false, mensaje: "Ese RUT ya está registrado por otra cuenta.", errores: { rutEmpresa: "Este RUT ya está registrado" } };
    }
    return { ok: false, mensaje: "No pudimos guardar los datos. Revisa la información e intenta de nuevo." };
  }

  revalidatePath("/", "layout");
  return { ok: true, mensaje: "Datos de la empresa guardados." };
}
