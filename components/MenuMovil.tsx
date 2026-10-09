"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { LogoSinEslogan } from "./Logo";

export type Enlace = { href: string; texto: string };

export default function MenuMovil({
  enlaces,
  conSesion,
  salir,
}: {
  enlaces: Enlace[];
  conSesion: boolean;
  salir: () => Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);

  // Bloquea el scroll de fondo mientras está abierto.
  useEffect(() => {
    document.body.style.overflow = abierto ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [abierto]);

  const cerrar = () => setAbierto(false);
  const item = "block rounded-lg px-3 py-3 text-base font-medium text-marino hover:bg-fondo-suave";

  return (
    <div className="sm:hidden">
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Abrir menú"
        aria-expanded={abierto}
        aria-controls="menu-movil"
        className="rounded-lg p-2 text-marino hover:bg-fondo-suave focus:outline-none focus:ring-2 focus:ring-turquesa"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {/* Portal a <body>: el backdrop-blur del encabezado confinaría un panel fixed a su altura. */}
      {abierto && createPortal(
        <div id="menu-movil" role="dialog" aria-modal="true" aria-label="Menú" className="fixed inset-0 z-50 bg-fondo">
          <div className="flex h-16 items-center justify-between border-b border-borde px-4">
            <LogoSinEslogan />
            <button
              type="button"
              onClick={cerrar}
              aria-label="Cerrar menú"
              className="rounded-lg p-2 text-marino hover:bg-fondo-suave focus:outline-none focus:ring-2 focus:ring-turquesa"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <nav aria-label="Principal" className="space-y-1 p-4">
            <Link href="/" onClick={cerrar} className={item}>Inicio</Link>
            {enlaces.map((e) => (
              <Link key={e.href} href={e.href} onClick={cerrar} className={item}>{e.texto}</Link>
            ))}
            <div className="my-3 border-t border-borde" />
            {conSesion ? (
              <form action={salir}>
                <button className={`${item} w-full text-left`}>Salir</button>
              </form>
            ) : (
              <>
                <Link href="/ingresar" onClick={cerrar} className={item}>Ingresar</Link>
                <Link href="/registro" onClick={cerrar} className="mt-2 block rounded-lg bg-turquesa-oscuro px-3 py-3 text-center text-base font-medium text-white hover:bg-turquesa-hover">
                  Crear cuenta
                </Link>
              </>
            )}
          </nav>
        </div>,
        document.body
      )}
    </div>
  );
}
