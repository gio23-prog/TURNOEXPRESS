"use server";

import { revalidatePath } from "next/cache";
import { usuarioTrabajador } from "@/lib/trabajador";
import { sugerirCV, textoDePDF } from "@/lib/cv-lectura";
import {
  experienciaSchema, formacionSchema, habilidadesSchema, idiomasSchema, movilidadSchema, preferenciasSchema, resumenSchema,
  type ExperienciaInput, type FormacionInput, type MovilidadInput, type PreferenciasInput, type ResumenInput,
} from "@/lib/schemas/cv";
import { errores } from "@/lib/schemas/trabajador";

type Resultado = { ok: boolean; mensaje: string; errores?: Record<string, string> };

const RUTA = "/trabajador/perfil";
const aFecha = (ym: string) => (ym ? `${ym}-01` : null);
/** Los errores de negocio de la base (P0001) vienen en español. */
const mensajeDe = (e: { code?: string; message: string }, porDefecto: string) => (e.code === "P0001" ? e.message : porDefecto);
const invalido = (e: Record<string, string>): Resultado => ({ ok: false, mensaje: "Revisa los campos marcados.", errores: e });

async function sesion() {
  const s = await usuarioTrabajador();
  if (!s.uid) return { ...s, uid: null as null };
  const { data: wp } = await s.supabase.from("worker_profiles").select("user_id").eq("user_id", s.uid).maybeSingle();
  if (!wp) return { ...s, uid: null as null, error: "Primero completa tus datos personales." };
  return s;
}

export async function guardarResumen(datos: ResumenInput): Promise<Resultado> {
  const r = resumenSchema.safeParse(datos);
  if (!r.success) return invalido(errores(resumenSchema, datos));
  const { supabase, uid, error } = await sesion();
  if (!uid) return { ok: false, mensaje: error! };
  const { error: e } = await supabase.from("worker_profiles").update({
    headline: r.data.titular || null,
    bio: r.data.descripcion || null,
    years_experience: r.data.anios === "" ? null : Number(r.data.anios),
    can_issue_boleta: r.data.emiteBoleta,
  }).eq("user_id", uid);
  if (e) return { ok: false, mensaje: "No pudimos guardar. Intenta de nuevo." };
  revalidatePath(RUTA);
  return { ok: true, mensaje: "Guardado." };
}

export async function guardarExperiencia(datos: ExperienciaInput): Promise<Resultado> {
  const r = experienciaSchema.safeParse(datos);
  if (!r.success) return invalido(errores(experienciaSchema, datos));
  const { supabase, uid, error } = await sesion();
  if (!uid) return { ok: false, mensaje: error! };
  const d = r.data;
  const fila = {
    position: d.cargo, company: d.empresa, description: d.funciones || null, location: d.lugar || null,
    start_date: aFecha(d.inicio), end_date: d.actual ? null : aFecha(d.termino), is_current: d.actual,
  };
  const { error: e } = d.id
    ? await supabase.from("worker_experiences").update(fila).eq("id", d.id).eq("worker_id", uid)
    : await supabase.from("worker_experiences").insert({ worker_id: uid, ...fila });
  if (e) return { ok: false, mensaje: mensajeDe(e, "No pudimos guardar la experiencia. Revisa las fechas.") };
  revalidatePath(RUTA);
  return { ok: true, mensaje: "Experiencia guardada." };
}

export async function borrarExperiencia(id: string): Promise<Resultado> {
  const { supabase, uid, error } = await sesion();
  if (!uid) return { ok: false, mensaje: error! };
  const { error: e } = await supabase.from("worker_experiences").delete().eq("id", id).eq("worker_id", uid);
  if (e) return { ok: false, mensaje: "No pudimos eliminarla." };
  revalidatePath(RUTA);
  return { ok: true, mensaje: "Experiencia eliminada." };
}

export async function guardarFormacion(datos: FormacionInput): Promise<Resultado> {
  const r = formacionSchema.safeParse(datos);
  if (!r.success) return invalido(errores(formacionSchema, datos));
  const { supabase, uid, error } = await sesion();
  if (!uid) return { ok: false, mensaje: error! };
  const d = r.data;
  const fila = {
    institution: d.institucion, title: d.titulo || null, level: d.nivel,
    start_date: aFecha(d.inicio), end_date: d.actual ? null : aFecha(d.termino), is_current: d.actual,
  };
  const { error: e } = d.id
    ? await supabase.from("worker_education").update(fila).eq("id", d.id).eq("worker_id", uid)
    : await supabase.from("worker_education").insert({ worker_id: uid, ...fila });
  if (e) return { ok: false, mensaje: mensajeDe(e, "No pudimos guardar la formación. Revisa las fechas.") };
  revalidatePath(RUTA);
  return { ok: true, mensaje: "Formación guardada." };
}

export async function borrarFormacion(id: string): Promise<Resultado> {
  const { supabase, uid, error } = await sesion();
  if (!uid) return { ok: false, mensaje: error! };
  const { error: e } = await supabase.from("worker_education").delete().eq("id", id).eq("worker_id", uid);
  if (e) return { ok: false, mensaje: "No pudimos eliminarla." };
  revalidatePath(RUTA);
  return { ok: true, mensaje: "Formación eliminada." };
}

export async function guardarIdiomas(lista: { idioma: string; nivel: string }[]): Promise<Resultado> {
  const r = idiomasSchema.safeParse(lista);
  if (!r.success) return { ok: false, mensaje: r.error.issues[0]?.message ?? "Revisa los idiomas." };
  const { supabase, uid, error } = await sesion();
  if (!uid) return { ok: false, mensaje: error! };
  const { error: e1 } = await supabase.from("worker_languages").delete().eq("worker_id", uid);
  if (e1) return { ok: false, mensaje: "No pudimos guardar los idiomas." };
  if (r.data.length) {
    const { error: e2 } = await supabase.from("worker_languages")
      .insert(r.data.map((x) => ({ worker_id: uid, language: x.idioma, level: x.nivel })));
    if (e2) return { ok: false, mensaje: mensajeDe(e2, "No pudimos guardar los idiomas.") };
  }
  revalidatePath(RUTA);
  return { ok: true, mensaje: "Idiomas guardados." };
}

export async function guardarHabilidades(lista: string[]): Promise<Resultado> {
  const unicas = [...new Map(lista.map((h) => [h.trim().toLowerCase(), h.trim()])).values()].filter(Boolean);
  const r = habilidadesSchema.safeParse(unicas);
  if (!r.success) return { ok: false, mensaje: r.error.issues[0]?.message ?? "Revisa las habilidades." };
  const { supabase, uid, error } = await sesion();
  if (!uid) return { ok: false, mensaje: error! };
  const { error: e1 } = await supabase.from("worker_skill_tags").delete().eq("worker_id", uid);
  if (e1) return { ok: false, mensaje: "No pudimos guardar las habilidades." };
  if (r.data.length) {
    const { error: e2 } = await supabase.from("worker_skill_tags").insert(r.data.map((tag) => ({ worker_id: uid, tag })));
    if (e2) return { ok: false, mensaje: mensajeDe(e2, "No pudimos guardar las habilidades.") };
  }
  revalidatePath(RUTA);
  return { ok: true, mensaje: "Habilidades guardadas." };
}

export async function guardarMovilidad(datos: MovilidadInput): Promise<Resultado> {
  const r = movilidadSchema.safeParse(datos);
  if (!r.success) return { ok: false, mensaje: "Datos inválidos." };
  const { supabase, uid, error } = await sesion();
  if (!uid) return { ok: false, mensaje: error! };
  const { error: e } = await supabase.from("worker_profiles")
    .update({ can_travel: r.data.viajar, can_relocate: r.data.residencia, has_vehicle: r.data.vehiculo }).eq("user_id", uid);
  if (e) return { ok: false, mensaje: "No pudimos guardar." };
  revalidatePath(RUTA);
  return { ok: true, mensaje: "Guardado." };
}

export async function guardarPreferencias(datos: PreferenciasInput): Promise<Resultado> {
  const r = preferenciasSchema.safeParse(datos);
  if (!r.success) return { ok: false, mensaje: r.error.issues[0]?.message ?? "Revisa los datos." };
  const { supabase, uid, error } = await sesion();
  if (!uid) return { ok: false, mensaje: error! };
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabase.from("worker_categories").delete().eq("worker_id", uid),
    supabase.from("service_areas").delete().eq("worker_id", uid),
  ]);
  if (e1 || e2) return { ok: false, mensaje: "No pudimos guardar tus rubros y comunas." };
  const [{ error: e3 }, { error: e4 }] = await Promise.all([
    r.data.rubros.length
      ? supabase.from("worker_categories").insert(r.data.rubros.map((c) => ({ worker_id: uid, category_id: c })))
      : Promise.resolve({ error: null }),
    r.data.comunas.length
      ? supabase.from("service_areas").insert(r.data.comunas.map((c) => ({ worker_id: uid, comuna_id: c })))
      : Promise.resolve({ error: null }),
  ]);
  if (e3 || e4) return { ok: false, mensaje: "No pudimos guardar tus rubros y comunas." };
  revalidatePath(RUTA);
  return { ok: true, mensaje: "Guardado." };
}

/**
 * Lee el CV en PDF y completa SOLO las secciones vacías del CV estructurado.
 * Nunca sobrescribe lo que la persona ya escribió. Todo queda editable.
 */
export async function importarDesdeCV(): Promise<Resultado> {
  const { supabase, uid, error } = await sesion();
  if (!uid) return { ok: false, mensaje: error! };
  const { data: wp } = await supabase.from("worker_profiles")
    .select("cv_path, headline, bio, years_experience, can_travel, can_relocate, has_vehicle").eq("user_id", uid).single();
  if (!wp?.cv_path) return { ok: false, mensaje: "Primero sube tu currículum en PDF." };

  const { data: archivo, error: eDescarga } = await supabase.storage.from("curriculums").download(wp.cv_path);
  if (eDescarga || !archivo) return { ok: false, mensaje: "No pudimos abrir tu currículum. Intenta de nuevo." };
  let texto = "";
  try {
    texto = await textoDePDF(new Uint8Array(await archivo.arrayBuffer()));
  } catch {
    return { ok: false, mensaje: "No pudimos leer tu currículum. Completa tu CV a mano." };
  }
  if (texto.replace(/\s/g, "").length < 50) {
    return { ok: false, mensaje: "Tu currículum parece ser una imagen escaneada y no tiene texto que podamos leer. Completa tu CV a mano." };
  }

  const cuenta = (tabla: string) => supabase.from(tabla).select("*", { count: "exact", head: true }).eq("worker_id", uid);
  const [cats, coms, nExp, nEdu, nIdi, nHab, nRub, nCom] = await Promise.all([
    supabase.from("categories").select("id, name").is("parent_id", null).eq("active", true),
    supabase.from("comunas").select("id, name").eq("active", true),
    cuenta("worker_experiences"), cuenta("worker_education"), cuenta("worker_languages"),
    cuenta("worker_skill_tags"), cuenta("worker_categories"), cuenta("service_areas"),
  ]);
  const s = sugerirCV(
    texto,
    (cats.data ?? []).map((c) => ({ id: c.id as number, nombre: c.name as string })),
    (coms.data ?? []).map((c) => ({ id: c.id as number, nombre: c.name as string })),
  );

  const agregado: string[] = [];
  const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

  // Titular, descripción, años y movilidad: solo si están vacíos.
  const cambios: Record<string, unknown> = {};
  if (!wp.headline && s.titular) cambios.headline = s.titular;
  if (!wp.bio && s.descripcion) cambios.bio = s.descripcion;
  if (wp.years_experience == null && s.anios) cambios.years_experience = Math.min(60, Number(s.anios));
  if (!wp.can_travel && !wp.can_relocate && !wp.has_vehicle) {
    if (s.movilidad.viajar) cambios.can_travel = true;
    if (s.movilidad.residencia) cambios.can_relocate = true;
    if (s.movilidad.vehiculo) cambios.has_vehicle = true;
  }
  if (Object.keys(cambios).length) {
    const { error: e } = await supabase.from("worker_profiles").update(cambios).eq("user_id", uid);
    if (!e) agregado.push(cambios.headline || cambios.bio ? "tu resumen" : "datos de tu perfil");
  }

  if (!nExp.count) {
    const filas = s.experiencias
      .map((x) => experienciaSchema.safeParse(x))
      .filter((r) => r.success).map((r) => r.data!)
      .map((d) => ({
        worker_id: uid, position: d.cargo, company: d.empresa, description: d.funciones || null, location: d.lugar || null,
        start_date: aFecha(d.inicio), end_date: d.actual ? null : aFecha(d.termino), is_current: d.actual,
      }));
    if (filas.length && !(await supabase.from("worker_experiences").insert(filas)).error) {
      agregado.push(plural(filas.length, "experiencia", "experiencias"));
    }
  }
  if (!nEdu.count) {
    const filas = s.formacion
      .map((x) => formacionSchema.safeParse(x)).filter((r) => r.success).map((r) => r.data!)
      .map((d) => ({
        worker_id: uid, institution: d.institucion, title: d.titulo || null, level: d.nivel,
        start_date: aFecha(d.inicio), end_date: d.actual ? null : aFecha(d.termino), is_current: d.actual,
      }));
    if (filas.length && !(await supabase.from("worker_education").insert(filas)).error) {
      agregado.push(plural(filas.length, "formación", "formaciones"));
    }
  }
  if (!nIdi.count && s.idiomas.length) {
    const ok = !(await supabase.from("worker_languages")
      .insert(s.idiomas.map((x) => ({ worker_id: uid, language: x.idioma, level: x.nivel })))).error;
    if (ok) agregado.push(plural(s.idiomas.length, "idioma", "idiomas"));
  }
  if (!nHab.count && s.habilidades.length) {
    const ok = !(await supabase.from("worker_skill_tags").insert(s.habilidades.map((tag) => ({ worker_id: uid, tag })))).error;
    if (ok) agregado.push(plural(s.habilidades.length, "habilidad", "habilidades"));
  }
  if (!nRub.count && s.rubros.length) {
    const ok = !(await supabase.from("worker_categories").insert(s.rubros.map((c) => ({ worker_id: uid, category_id: c })))).error;
    if (ok) agregado.push(plural(s.rubros.length, "rubro", "rubros"));
  }
  if (!nCom.count && s.comunas.length) {
    const ok = !(await supabase.from("service_areas").insert(s.comunas.map((c) => ({ worker_id: uid, comuna_id: c })))).error;
    if (ok) agregado.push(plural(s.comunas.length, "comuna", "comunas"));
  }

  revalidatePath(RUTA);
  if (!agregado.length) {
    return { ok: false, mensaje: "No agregamos nada: tus secciones ya tienen datos o no encontramos información en el PDF. Puedes completarlas a mano." };
  }
  const lista = agregado.length > 1 ? `${agregado.slice(0, -1).join(", ")} y ${agregado.at(-1)}` : agregado[0];
  return { ok: true, mensaje: `Agregamos ${lista} desde tu currículum. Revisa cada sección y corrige lo que haga falta.` };
}
