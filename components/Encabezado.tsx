import Link from "next/link";
import { createClient, supabaseConfigurado } from "@/lib/supabase/server";
import { obtenerRol, type Rol } from "@/lib/supabase/perfil";
import { salir } from "@/app/auth/actions";
import { LogoSinEslogan } from "./Logo";
import MenuMovil, { type Enlace } from "./MenuMovil";

// Solo se enlazan pantallas que existen.
function enlacesPara(rol: Rol | null): Enlace[] {
  if (rol === "empresa") return [{ href: "/empresa/publicar", texto: "Publicar turno" }];
  if (rol === "trabajador")
    return [
      { href: "/trabajos", texto: "Buscar turnos" },
      { href: "/trabajador/postulaciones", texto: "Mis postulaciones" },
    ];
  return [{ href: "/trabajos", texto: "Buscar turnos" }];
}

async function rolActual(): Promise<Rol | null> {
  // Sin variables de Supabase (p. ej. un build local sin .env) se muestra como visitante.
  if (!supabaseConfigurado()) return null;
  return obtenerRol(await createClient());
}

export default async function Encabezado() {
  const rol = await rolActual();
  const enlaces = enlacesPara(rol);
  const conSesion = rol !== null;

  return (
    <header className="sticky top-0 z-40 border-b border-borde bg-fondo/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" aria-label="Turnoexpress, ir al inicio" className="shrink-0">
          <LogoSinEslogan priority />
        </Link>

        <nav aria-label="Principal" className="hidden items-center gap-6 sm:flex">
          {enlaces.map((e) => (
            <Link key={e.href} href={e.href} className="text-sm font-medium text-texto-suave hover:text-marino">
              {e.texto}
            </Link>
          ))}
          {conSesion ? (
            <form action={salir}>
              <button className="text-sm font-medium text-texto-suave hover:text-marino">Salir</button>
            </form>
          ) : (
            <>
              <Link href="/ingresar" className="text-sm font-medium text-texto-suave hover:text-marino">Ingresar</Link>
              <Link href="/registro" className="rounded-lg bg-turquesa-oscuro px-4 py-2 text-sm font-medium text-white hover:bg-turquesa-hover">
                Crear cuenta
              </Link>
            </>
          )}
        </nav>

        <MenuMovil enlaces={enlaces} conSesion={conSesion} salir={salir} />
      </div>
    </header>
  );
}
