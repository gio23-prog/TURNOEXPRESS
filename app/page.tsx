import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { clp } from "@/lib/formato";
import Encabezado, { obtenerSesion } from "./componentes/encabezado";

const PASOS_EMPRESA = [
  ["Publica el turno", "Fecha, horario, comuna y pago. Toma un par de minutos y ves el valor por hora antes de publicar."],
  ["Revisa postulantes", "Mira experiencia y evaluaciones de quienes postularon y elige a quien prefieras."],
  ["Confirma y evalúa", "La persona acepta, recibe la dirección y las condiciones. Al terminar, ambos se evalúan."],
] as const;

const PASOS_TRABAJADOR = [
  ["Arma tu perfil", "Indica qué sabes hacer, en qué comunas puedes trabajar y tu disponibilidad."],
  ["Postula desde el teléfono", "Filtra por fecha, comuna y tarifa. Postular es gratis y toma pocos pasos."],
  ["Trabaja con condiciones claras", "Antes de aceptar ves horario, pago y modalidad. Nada cambia sin tu aprobación."],
] as const;

export default async function Inicio() {
  const supabase = await createClient();
  const [perfil, catsRes, regRes, comRes] = await Promise.all([
    obtenerSesion(),
    supabase.from("categories").select("id, name").is("parent_id", null).eq("active", true).order("sort_order"),
    supabase.from("regions").select("id", { count: "exact", head: true }).eq("active", true),
    supabase.from("comunas").select("id", { count: "exact", head: true }).eq("active", true),
  ]);

  const categorias = catsRes.data ?? [];
  const regiones = regRes.count ?? 0;
  const comunas = comRes.count ?? 0;

  return (
    <div className="min-h-full bg-stone-50 text-stone-900">
      <Encabezado sesion={perfil} />

      <main>
        {/* Portada */}
        <section className="mx-auto grid max-w-5xl items-center gap-10 px-4 py-12 md:grid-cols-[1.15fr_1fr] md:py-16">
          <div>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-balance sm:text-5xl">
              Turnos cubiertos hoy, en todo Chile.
            </h1>
            <p className="mt-4 max-w-prose text-lg text-stone-600">
              Si a tu negocio le falta alguien para el turno de esta noche, publícalo en minutos. Si buscas trabajo por
              horas, por día o de fin de semana, encuentra turnos cerca de ti.
            </p>

            {perfil ? (
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                {perfil.role === "empresa" ? (
                  <Link href="/empresa/publicar" className="rounded-xl bg-teal-700 px-6 py-3 text-center font-semibold text-white hover:bg-teal-800">
                    Publicar un turno
                  </Link>
                ) : (
                  <Link href="/trabajos" className="rounded-xl bg-teal-700 px-6 py-3 text-center font-semibold text-white hover:bg-teal-800">
                    Buscar turnos
                  </Link>
                )}
              </div>
            ) : (
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/registro" className="rounded-xl bg-teal-700 px-6 py-3 text-center font-semibold text-white hover:bg-teal-800">
                  Necesito personal
                </Link>
                <Link href="/trabajos" className="rounded-xl border border-stone-300 bg-white px-6 py-3 text-center font-semibold text-stone-800 hover:border-teal-700">
                  Busco turnos
                </Link>
              </div>
            )}

            {regiones > 0 && (
              <p className="mt-6 text-sm text-stone-500 tabular-nums">
                Disponible en {regiones} regiones y {comunas} comunas
              </p>
            )}
          </div>

          {/* Ejemplo de turno */}
          <figure className="mx-auto w-full max-w-sm">
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Gastronomía</p>
                  <p className="mt-1 text-lg font-bold">Garzón o garzona</p>
                  <p className="text-sm text-stone-600">Restaurante en Providencia</p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                  Para hoy
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-stone-100 pt-4 text-sm tabular-nums">
                <div>
                  <dt className="text-stone-500">Horario</dt>
                  <dd className="font-semibold">18:00 a 00:00</dd>
                </div>
                <div>
                  <dt className="text-stone-500">Duración</dt>
                  <dd className="font-semibold">6 h</dd>
                </div>
                <div>
                  <dt className="text-stone-500">Pago total</dt>
                  <dd className="font-semibold">{clp(36000)}</dd>
                </div>
                <div>
                  <dt className="text-stone-500">Por hora</dt>
                  <dd className="font-semibold">{clp(6000)}</dd>
                </div>
              </dl>
            </div>
            <figcaption className="mt-2 text-center text-xs text-stone-500">Ejemplo de cómo se ve un turno publicado</figcaption>
          </figure>
        </section>

        {/* Cómo funciona */}
        <section className="border-y border-stone-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-12">
            <h2 className="text-2xl font-bold tracking-tight">Cómo funciona</h2>
            <div className="mt-8 grid gap-10 md:grid-cols-2">
              {[
                ["Para negocios", PASOS_EMPRESA],
                ["Para trabajadores", PASOS_TRABAJADOR],
              ].map(([titulo, pasos]) => (
                <div key={titulo as string}>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-teal-800">{titulo as string}</h3>
                  <ol className="mt-4 space-y-5">
                    {(pasos as readonly (readonly [string, string])[]).map(([t, d], i) => (
                      <li key={t} className="flex gap-4">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold">{t}</p>
                          <p className="mt-0.5 text-stone-600">{d}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Categorías */}
        {categorias.length > 0 && (
          <section className="mx-auto max-w-5xl px-4 py-12">
            <h2 className="text-2xl font-bold tracking-tight">Rubros</h2>
            <ul className="mt-5 flex flex-wrap gap-2">
              {categorias.map((c) => (
                <li key={c.id} className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800">
                  {c.name}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Reglas claras */}
        <section className="mx-auto max-w-5xl px-4 pb-14">
          <div className="rounded-2xl bg-stone-900 p-6 text-stone-100 sm:p-8">
            <h2 className="text-2xl font-bold tracking-tight text-white">Reglas claras para ambas partes</h2>
            <ul className="mt-5 grid gap-5 sm:grid-cols-3">
              <li>
                <p className="font-semibold text-white">Postular es gratis</p>
                <p className="mt-1 text-sm text-stone-300">No cobramos a los trabajadores por buscar ni por postular.</p>
              </li>
              <li>
                <p className="font-semibold text-white">Modalidad revisada</p>
                <p className="mt-1 text-sm text-stone-300">
                  Si un turno tiene indicios de relación laboral, lo revisamos antes de publicarlo. No todo trabajo por
                  horas se puede pagar con boleta de honorarios.
                </p>
              </li>
              <li>
                <p className="font-semibold text-white">Datos protegidos</p>
                <p className="mt-1 text-sm text-stone-300">
                  La dirección exacta solo la ve quien queda contratado. Tu RUT y teléfono nunca son públicos.
                </p>
              </li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-stone-500">
          TurnoExpress (nombre provisional) · Santiago, Chile · 2026
        </div>
      </footer>
    </div>
  );
}
