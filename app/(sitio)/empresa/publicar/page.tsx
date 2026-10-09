import { createClient } from "@/lib/supabase/server";
import Formulario, { type Categoria, type Comuna } from "./formulario";

export default async function PublicarTurno() {
  const supabase = await createClient();
  const [{ data: cats }, { data: comunas }] = await Promise.all([
    supabase.from("categories").select("id, parent_id, name, notes, sort_order").order("sort_order"),
    supabase.from("comunas").select("id, name").eq("active", true).order("name"),
  ]);

  // Se publica en una subcategoría, agrupada bajo su categoría principal.
  const padres = (cats ?? []).filter((c) => c.parent_id === null);
  const categorias: Categoria[] = padres.map((p) => ({
    grupo: p.name,
    opciones: (cats ?? [])
      .filter((c) => c.parent_id === p.id)
      .map((c) => ({ id: String(c.id), nombre: c.name, nota: c.notes ?? undefined })),
  }));

  return <Formulario categorias={categorias} comunas={(comunas ?? []).map((c): Comuna => ({ id: String(c.id), nombre: c.name }))} />;
}
