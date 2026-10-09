import Link from "next/link";
import { LogoSinEslogan } from "@/components/Logo";

export default function NoEncontrado() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <Link href="/" aria-label="Turnoexpress, ir al inicio"><LogoSinEslogan className="h-8 w-auto" /></Link>
      <p className="mt-10 text-sm font-medium text-turquesa-oscuro">Error 404</p>
      <h1 className="mt-2 text-2xl font-semibold text-marino">No encontramos esta página</h1>
      <p className="mt-2 text-texto-suave">Puede que el enlace esté mal escrito o que la oferta ya no esté disponible.</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/trabajos" className="rounded-lg bg-turquesa-oscuro px-5 py-3 font-medium text-white hover:bg-turquesa-hover">Buscar turnos</Link>
        <Link href="/" className="rounded-lg border border-borde-fuerte px-5 py-3 font-medium text-marino hover:border-turquesa">Ir al inicio</Link>
      </div>
    </main>
  );
}
