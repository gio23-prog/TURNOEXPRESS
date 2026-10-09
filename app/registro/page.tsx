import { createClient } from "@/lib/supabase/server";
import Registro from "./registro";

export default async function RegistroPage() {
  const supabase = await createClient();
  const [{ data: regs }, { data: coms }] = await Promise.all([
    supabase.from("regions").select("id, name, sort_order").eq("active", true).order("sort_order"),
    supabase.from("comunas").select("id, name, region_id").eq("active", true).order("name"),
  ]);
  const regiones = (regs ?? []).map((r) => ({ id: r.id as number, nombre: r.name as string }));
  const comunas = (coms ?? []).map((c) => ({ id: c.id as number, nombre: c.name as string, regionId: c.region_id as number }));
  return <Registro regiones={regiones} comunas={comunas} />;
}
