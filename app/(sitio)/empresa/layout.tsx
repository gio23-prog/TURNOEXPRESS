import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerRol } from "@/lib/supabase/perfil";

export default async function EmpresaLayout({ children }: LayoutProps<"/empresa">) {
  const rol = await obtenerRol(await createClient());
  if (rol === null) redirect("/ingresar");
  if (rol !== "empresa") redirect("/");
  return children;
}
