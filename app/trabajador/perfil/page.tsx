import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fecha } from "@/lib/formato";
import Encabezado, { obtenerSesion } from "@/app/componentes/encabezado";
import { FormDatos, FormCV } from "./formularios";
import MiCV, { type DatosCV } from "./mi-cv";

const PASOS = [
  { id: "datos", nombre: "Datos personales" },
  { id: "cv", nombre: "Currículum" },
  { id: "perfil", nombre: "Mi CV" },
] as const;
type Paso = (typeof PASOS)[number]["id"];

export default async function PerfilTrabajador({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/ingresar");
  if (sesion.role !== "trabajador") redirect("/empresa/perfil");
  const sp = await searchParams;

  const supabase = await createClient();
  const uid = sesion.id;
  const [
    { data: p }, { data: priv }, { data: wp }, { data: rubrosSel }, { data: areasSel },
    { data: regs }, { data: coms }, { data: cats },
    { data: exps }, { data: edus }, { data: idis }, { data: habs }, { data: auth },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name, phone, rut").eq("id", uid).single(),
    supabase.from("worker_private").select("address_line, comuna_id").eq("user_id", uid).maybeSingle(),
    supabase.from("worker_profiles")
      .select("headline, bio, years_experience, can_issue_boleta, can_travel, can_relocate, has_vehicle, cv_path, cv_uploaded_at")
      .eq("user_id", uid).maybeSingle(),
    supabase.from("worker_categories").select("category_id").eq("worker_id", uid),
    supabase.from("service_areas").select("comuna_id").eq("worker_id", uid),
    supabase.from("regions").select("id, name").eq("active", true).order("sort_order"),
    supabase.from("comunas").select("id, name, region_id").eq("active", true).order("name"),
    supabase.from("categories").select("id, name").is("parent_id", null).eq("active", true).order("sort_order"),
    supabase.from("worker_experiences").select("id, position, company, description, location, start_date, end_date, is_current")
      .eq("worker_id", uid).order("is_current", { ascending: false }).order("start_date", { ascending: false }),
    supabase.from("worker_education").select("id, institution, title, level, start_date, end_date, is_current")
      .eq("worker_id", uid).order("is_current", { ascending: false }).order("end_date", { ascending: false, nullsFirst: true }),
    supabase.from("worker_languages").select("language, level").eq("worker_id", uid).order("language"),
    supabase.from("worker_skill_tags").select("tag").eq("worker_id", uid).order("tag"),
    supabase.auth.getUser(),
  ]);

  const regiones = (regs ?? []).map((r) => ({ id: r.id as number, nombre: r.name as string }));
  const comunas = (coms ?? []).map((c) => ({ id: c.id as number, nombre: c.name as string, regionId: c.region_id as number }));
  const rubros = (cats ?? []).map((c) => ({ id: c.id as number, nombre: c.name as string }));

  const datosOk = !!(p?.phone && p?.rut && priv);
  const cvOk = !!wp?.cv_path;
  const completo: Record<Paso, boolean> = { datos: datosOk, cv: cvOk, perfil: !!wp?.headline || !!(exps ?? []).length };
  const pedido = PASOS.find((x) => x.id === sp.paso)?.id;
  const paso: Paso = pedido ?? (!datosOk ? "datos" : !cvOk ? "cv" : "perfil");
  const comunaPropia = comunas.find((c) => c.id === priv?.comuna_id);

  return (
    <div className="min-h-full bg-stone-50 text-stone-900">
      <Encabezado sesion={sesion} />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="text-2xl font-bold tracking-tight">{paso === "perfil" ? "Mi CV" : "Mi perfil"}</h1>
        {datosOk && cvOk ? (
          <p className="mt-1 text-stone-600">Tu perfil está listo para postular a ofertas.</p>
        ) : (
          <p className="mt-1 text-stone-600">Completa tus datos y sube tu currículum para poder postular a ofertas.</p>
        )}

        <nav aria-label="Pasos del perfil" className="mt-5">
          <ol className="grid grid-cols-3 gap-2">
            {PASOS.map((x, i) => {
              const activo = x.id === paso;
              return (
                <li key={x.id}>
                  <Link href={`/trabajador/perfil?paso=${x.id}`} aria-current={activo ? "step" : undefined}
                    className={`flex h-full flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center text-sm font-medium ${
                      activo ? "border-teal-700 bg-teal-50 text-teal-900" : "border-stone-200 bg-white text-stone-700 hover:border-teal-700"}`}>
                    <span className={`flex size-7 items-center justify-center rounded-full text-sm font-bold ${
                      completo[x.id] ? "bg-teal-700 text-white" : activo ? "bg-white text-teal-800 ring-2 ring-teal-700" : "bg-stone-100 text-stone-600"}`}
                      aria-hidden>
                      {completo[x.id] ? "✓" : i + 1}
                    </span>
                    {x.nombre}
                    <span className="sr-only">{completo[x.id] ? "(completo)" : "(pendiente)"}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="mt-5">
          {paso === "datos" && (
            <FormDatos
              regiones={regiones}
              comunas={comunas}
              siguiente={cvOk ? null : "/trabajador/perfil?paso=cv"}
              inicial={{
                nombre: p?.full_name ?? "",
                telefono: p?.phone ? p.phone.replace(/^\+56/, "") : "",
                rut: p?.rut ?? "",
                region: comunaPropia ? String(comunaPropia.regionId) : "",
                comuna: priv?.comuna_id ? String(priv.comuna_id) : "",
                direccion: priv?.address_line ?? "",
              }}
            />
          )}
          {paso === "cv" && (
            datosOk ? (
              <FormCV
                actual={wp?.cv_path ? { subido: wp.cv_uploaded_at ? fecha(wp.cv_uploaded_at) : null } : null}
                siguiente="/trabajador/perfil?paso=perfil&cv=1"
              />
            ) : (
              <Pendiente texto="Antes de subir tu currículum completa tus datos personales." href="/trabajador/perfil?paso=datos" />
            )
          )}
          {paso === "perfil" && (
            wp ? (
              <MiCV
                rubros={rubros}
                regiones={regiones}
                comunas={comunas}
                importarAlAbrir={sp.cv === "1"}
                datos={{
                  contacto: {
                    nombre: p?.full_name ?? sesion.nombre,
                    telefono: p?.phone ?? "",
                    correo: auth.user?.email ?? "",
                    comuna: comunaPropia?.nombre ?? "",
                  },
                  resumen: {
                    titular: wp.headline ?? "",
                    descripcion: wp.bio ?? "",
                    anios: wp.years_experience == null ? "" : String(wp.years_experience),
                    emiteBoleta: wp.can_issue_boleta,
                  },
                  experiencias: (exps ?? []).map((x) => ({
                    id: x.id, cargo: x.position, empresa: x.company, funciones: x.description ?? "", lugar: x.location ?? "",
                    inicio: mesDe(x.start_date), termino: mesDe(x.end_date), actual: x.is_current,
                  })),
                  formacion: (edus ?? []).map((x) => ({
                    id: x.id, institucion: x.institution, titulo: x.title ?? "", nivel: x.level as DatosCV["formacion"][number]["nivel"],
                    inicio: mesDe(x.start_date), termino: mesDe(x.end_date), actual: x.is_current,
                  })),
                  idiomas: (idis ?? []).map((x) => ({ idioma: x.language, nivel: x.level })),
                  habilidades: (habs ?? []).map((x) => x.tag as string),
                  movilidad: { viajar: wp.can_travel, residencia: wp.can_relocate, vehiculo: wp.has_vehicle },
                  rubrosSel: (rubrosSel ?? []).map((r) => r.category_id as number),
                  comunasSel: (areasSel ?? []).map((a) => a.comuna_id as number),
                  cv: wp.cv_path ? { subido: wp.cv_uploaded_at ? fecha(wp.cv_uploaded_at) : null } : null,
                } satisfies DatosCV}
              />
            ) : (
              <Pendiente texto="Primero completa tus datos personales." href="/trabajador/perfil?paso=datos" />
            )
          )}
        </div>
      </main>
    </div>
  );
}

/** "2019-04-01" → "2019-04" */
const mesDe = (d: string | null) => (d ? d.slice(0, 7) : "");

function Pendiente({ texto, href }: { texto: string; href: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-6 text-center">
      <p className="font-medium">{texto}</p>
      <Link href={href} className="mt-3 inline-block font-medium text-teal-800 underline">Ir a datos personales</Link>
    </div>
  );
}
