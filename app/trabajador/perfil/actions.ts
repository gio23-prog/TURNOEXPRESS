"use server";

import { revalidatePath } from "next/cache";
import { guardarDatosPersonales, usuarioTrabajador } from "@/lib/trabajador";
import { datosPersonalesSchema, errores, type DatosPersonalesInput } from "@/lib/schemas/trabajador";

type Resultado = { ok: boolean; mensaje: string; errores?: Record<string, string> };

const CV_MAX = 5 * 1024 * 1024;

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
