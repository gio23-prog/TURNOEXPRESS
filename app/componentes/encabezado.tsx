import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cerrarSesion } from "@/app/salir/actions";

export type Sesion = { id: string; role: "empresa" | "trabajador"; nombre: string } | null;

/** Lee la sesión y el perfil del usuario actual (o null si no ingresó). */
export async function obtenerSesion(): Promise<Sesion> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase.from("profiles").select("role, full_name").eq("id", auth.user.id).single();
  if (!data) return null;
  return { id: auth.user.id, role: data.role, nombre: data.full_name };
}

export default function Encabezado({ sesion }: { sesion: Sesion }) {
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-xl font-extrabold tracking-tight" aria-label="TurnoExpress, inicio">
          Turno<span className="text-teal-700">Express</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/trabajos" className="rounded-lg px-2 py-2 font-medium text-stone-700 hover:bg-stone-100 sm:px-3">
            <span className="sm:hidden">Buscar</span>
            <span className="hidden sm:inline">Buscar turnos</span>
          </Link>
          {sesion?.role === "empresa" && (
            <>
              <Link href="/empresa/publicar" className="hidden rounded-lg px-3 py-2 font-medium text-stone-700 hover:bg-stone-100 sm:inline">
                Publicar
              </Link>
              <Link href="/empresa/perfil" className="rounded-lg px-2 py-2 font-medium text-stone-700 hover:bg-stone-100 sm:px-3">
                Mi empresa
              </Link>
            </>
          )}
          {sesion ? (
            <form action={cerrarSesion}>
              <button className="rounded-lg px-2 py-2 font-medium text-stone-700 hover:bg-stone-100 sm:px-3">Salir</button>
            </form>
          ) : (
            <>
              <Link href="/ingresar" className="rounded-lg px-2 py-2 font-medium text-stone-700 hover:bg-stone-100 sm:px-3">
                Ingresar
              </Link>
              <Link href="/registro" className="hidden rounded-lg bg-teal-700 px-3 py-2 font-medium text-white hover:bg-teal-800 sm:inline">
                Crear cuenta
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
