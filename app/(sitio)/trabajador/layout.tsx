import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { inicioSegunRol, obtenerRol } from "@/lib/supabase/perfil";

export default async function TrabajadorLayout({ children }: LayoutProps<"/trabajador">) {
  const rol = await obtenerRol(await createClient());
  if (rol === null) redirect("/ingresar");
  if (rol !== "trabajador") redirect(inicioSegunRol(rol));
  return children;
}
