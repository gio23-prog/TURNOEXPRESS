import Image from "next/image";

// Proporción real de los archivos en public/logo (1615×348): se fija el ancho
// de referencia y la altura se deriva para no deformar el logo. El tamaño visible
// lo define la clase CSS; el ancho de referencia (con su 2x) cubre pantallas de
// hasta 3x de densidad. Calidad 100 para no generar artefactos en colores planos.
const CALIDAD = 100;
const PROPORCION = 348 / 1615;

/** Logo sin eslogan, para encabezado y menú móvil. */
export function LogoSinEslogan({ className = "h-7 w-auto sm:h-8", priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/logo/logo-sin-eslogan.png"
      alt="Turnoexpress"
      width={200}
      height={Math.round(200 * PROPORCION)}
      quality={CALIDAD}
      className={className}
      priority={priority}
    />
  );
}

/** Logo con eslogan, para ingreso, registro y formularios. */
export function LogoCompleto({ className = "h-auto w-56 sm:w-72" }: { className?: string }) {
  return (
    <Image
      src="/logo/logo-completo.png"
      alt="Turnoexpress: trabajo temporal, oportunidades reales"
      width={320}
      height={Math.round(320 * PROPORCION)}
      quality={CALIDAD}
      className={className}
      priority
    />
  );
}
