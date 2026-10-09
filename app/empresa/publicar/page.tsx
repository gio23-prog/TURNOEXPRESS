import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Categoria, Comuna, Region } from "@/lib/schemas/publicar";
import FormularioPublicar from "./formulario";

export default async function PublicarTurnoPage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/ingresar");

  const { data: perfil } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  if (perfil?.role !== "empresa") {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-semibold text-stone-900">Solo para empresas</h1>
        <p className="mt-2 text-stone-700">Tu cuenta es de trabajador. Para publicar turnos necesitas una cuenta de empresa.</p>
        <Link href="/" className="mt-6 inline-block font-medium text-teal-800 underline">Volver al inicio</Link>
      </main>
    );
  }

  const [{ data: cats, error: errCats }, { data: regs, error: errRegs }, { data: coms, error: errComs }] = await Promise.all([
    supabase.from("categories").select("id, name, parent_id, sort_order").eq("active", true).order("sort_order").order("name"),
    supabase.from("regions").select("id, name, sort_order").eq("active", true).order("sort_order"),
    supabase.from("comunas").select("id, name, region_id").eq("active", true).order("name"),
  ]);

  if (errCats || errRegs || errComs || !cats?.length || !regs?.length || !coms?.length) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-semibold text-stone-900">No pudimos cargar el formulario</h1>
        <p className="mt-2 text-stone-700">
          Faltan las categorías, regiones o comunas en la base de datos. Revisa que las migraciones estén aplicadas en Supabase.
        </p>
      </main>
    );
  }

  const categorias: Categoria[] = cats
    .filter((c) => c.parent_id === null)
    .map((c) => ({
      id: c.id,
      nombre: c.name,
      subcategorias: cats.filter((s) => s.parent_id === c.id).map((s) => ({ id: s.id, nombre: s.name })),
    }))
    .filter((c) => c.subcategorias.length > 0);

  const regiones: Region[] = regs.map((r) => ({ id: r.id, nombre: r.name }));
  const comunas: Comuna[] = coms.map((c) => ({ id: c.id, nombre: c.name, regionId: c.region_id }));

  return <FormularioPublicar categorias={categorias} regiones={regiones} comunas={comunas} />;
}
