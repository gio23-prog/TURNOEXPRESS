"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { guardarDatosPersonales } from "@/lib/trabajador";
import { sugerirPerfil, textoDePDF, type Sugerencias } from "@/lib/cv-lectura";
import {
  datosPersonalesSchema, errores, perfilProfesionalSchema,
  type DatosPersonalesInput, type PerfilProfesionalInput,
} from "@/lib/schemas/trabajador";

type Resultado = { ok: boolean; mensaje: string; errores?: Record<string, string> };

const CV_MAX = 5 * 1024 * 1024;

async function usuarioTrabajador() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { supabase, uid: null, error: "Tu sesión expiró. Vuelve a ingresar." };
  const { data: p } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  if (p?.role !== "trabajador") return { supabase, uid: null, error: "Esta sección es solo para cuentas de trabajador." };
  return { supabase, uid: auth.user.id, error: null };
}

export async function guardarDatos(datos: DatosPersonalesInput): Promise<Resultado> {
  const e = errores(datosPersonalesSchema, datos);
  if (Object.keys(e).length) return { ok: false, mensaje: "Revisa los campos marcados.", errores: e };
  const { supabase, uid, error } = await usuarioTrabajador();
  if (!uid) return { ok: false, mensaje: error! };
  const r = await guardarDatosPersonales(supabase, uid, datosPersonalesSchema.parse(datos));
  revalidatePath("/trabajador/perfil");
  return r;
}

/** Sube el CV en PDF. Los CV anteriores se conservan porque cada postulación guarda el CV que se envió. */
export async function subirCV(form: FormData): Promise<Resultado> {
  const archivo = form.get("cv");
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, mensaje: "Elige un archivo PDF." };
  if (archivo.size > CV_MAX) return { ok: false, mensaje: "El archivo pesa más de 5 MB. Prueba con una versión más liviana." };

  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const esPDF = bytes.length > 4 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  if (!esPDF) return { ok: false, mensaje: "El archivo debe ser un PDF." };

  const { supabase, uid, error } = await usuarioTrabajador();
  if (!uid) return { ok: false, mensaje: error! };
  const { data: wp } = await supabase.from("worker_profiles").select("user_id").eq("user_id", uid).maybeSingle();
  if (!wp) return { ok: false, mensaje: "Primero completa tus datos personales." };

  const ruta = `${uid}/cv-${Date.now()}.pdf`;
  const { error: eSubida } = await supabase.storage.from("curriculums").upload(ruta, bytes, { contentType: "application/pdf" });
  if (eSubida) return { ok: false, mensaje: "No pudimos subir el archivo. Intenta de nuevo." };

  const { error: eGuardar } = await supabase.from("worker_profiles")
    .update({ cv_path: ruta, cv_uploaded_at: new Date().toISOString() }).eq("user_id", uid);
  if (eGuardar) return { ok: false, mensaje: "Subimos el archivo pero no pudimos asociarlo a tu perfil. Intenta de nuevo." };

  revalidatePath("/trabajador/perfil");
  return { ok: true, mensaje: "Currículum guardado. Se enviará con cada postulación." };
}

export async function guardarPerfil(datos: PerfilProfesionalInput): Promise<Resultado> {
  const parsed = perfilProfesionalSchema.safeParse(datos);
  if (!parsed.success) return { ok: false, mensaje: "Revisa los campos marcados.", errores: errores(perfilProfesionalSchema, datos) };
  const d = parsed.data;
  const { supabase, uid, error } = await usuarioTrabajador();
  if (!uid) return { ok: false, mensaje: error! };

  const { error: e1 } = await supabase.from("worker_profiles").update({
    display_name: d.nombreVisible,
    bio: d.descripcion || null,
    experience_summary: d.experiencia || null,
    years_experience: d.anios === "" ? null : Number(d.anios),
    can_issue_boleta: d.emiteBoleta,
  }).eq("user_id", uid);
  if (e1) return { ok: false, mensaje: "No pudimos guardar tu perfil. Primero completa tus datos personales." };

  // Rubros y comunas: se reemplaza la selección completa.
  const [{ error: e2 }, { error: e3 }] = await Promise.all([
    supabase.from("worker_categories").delete().eq("worker_id", uid),
    supabase.from("service_areas").delete().eq("worker_id", uid),
  ]);
  if (e2 || e3) return { ok: false, mensaje: "No pudimos actualizar tus rubros y comunas." };
  const [{ error: e4 }, { error: e5 }] = await Promise.all([
    d.rubros.length
      ? supabase.from("worker_categories").insert(d.rubros.map((c) => ({ worker_id: uid, category_id: c })))
      : Promise.resolve({ error: null }),
    d.comunas.length
      ? supabase.from("service_areas").insert(d.comunas.map((c) => ({ worker_id: uid, comuna_id: c })))
      : Promise.resolve({ error: null }),
  ]);
  if (e4 || e5) return { ok: false, mensaje: "No pudimos guardar tus rubros y comunas." };

  revalidatePath("/trabajador/perfil");
  return { ok: true, mensaje: "Perfil guardado." };
}

/** Lee el CV vigente y propone datos para el perfil. No guarda nada: la persona revisa y guarda. */
export async function sugerenciasDesdeCV(): Promise<{ ok: boolean; mensaje: string; sugerencias?: Sugerencias }> {
  const { supabase, uid, error } = await usuarioTrabajador();
  if (!uid) return { ok: false, mensaje: error! };
  const { data: wp } = await supabase.from("worker_profiles").select("cv_path").eq("user_id", uid).maybeSingle();
  if (!wp?.cv_path) return { ok: false, mensaje: "Primero sube tu currículum." };

  const { data: archivo, error: eDescarga } = await supabase.storage.from("curriculums").download(wp.cv_path);
  if (eDescarga || !archivo) return { ok: false, mensaje: "No pudimos abrir tu currículum. Intenta de nuevo." };

  let texto = "";
  try {
    texto = await textoDePDF(new Uint8Array(await archivo.arrayBuffer()));
  } catch {
    return { ok: false, mensaje: "No pudimos leer tu currículum. Completa el perfil a mano." };
  }
  if (texto.replace(/\s/g, "").length < 50) {
    return { ok: false, mensaje: "Tu currículum parece ser una imagen escaneada y no tiene texto que podamos leer. Completa el perfil a mano." };
  }

  const [{ data: cats }, { data: coms }] = await Promise.all([
    supabase.from("categories").select("id, name").is("parent_id", null).eq("active", true),
    supabase.from("comunas").select("id, name").eq("active", true),
  ]);
  const sugerencias = sugerirPerfil(
    texto,
    (cats ?? []).map((c) => ({ id: c.id as number, nombre: c.name as string })),
    (coms ?? []).map((c) => ({ id: c.id as number, nombre: c.name as string })),
  );
  const algo = sugerencias.descripcion || sugerencias.experiencia || sugerencias.anios || sugerencias.rubros.length || sugerencias.comunas.length;
  if (!algo) return { ok: false, mensaje: "No encontramos datos para completar en tu currículum. Completa el perfil a mano." };
  return { ok: true, mensaje: "Completamos los campos vacíos con tu currículum. Revísalos y corrige lo que haga falta antes de guardar.", sugerencias };
}
