import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { clp, diaRelativo, duracion, hora } from "@/lib/formato";
import Encabezado, { obtenerSesion } from "@/app/componentes/encabezado";
import Filtros, { type ValoresFiltro } from "./filtros";

const POR_PAGINA = 20;

const ATAJOS = [
  ["hoy", "Hoy"],
  ["manana", "Mañana"],
  ["finde", "Fin de semana"],
  ["pocas_horas", "Pocas horas"],
  ["un_dia", "Jornada completa"],
] as const;

type Turno = {
  id: string; title: string; category: string; parent_category: string | null;
  business_name: string; business_verified: boolean; comuna: string | null; modality: string;
  starts_at: string; ends_at: string; duration_minutes: number;
  pay_type: "total" | "por_hora"; pay_amount_clp: number; hourly_equivalent_clp: number; estimated_total_clp: number;
  is_urgent: boolean; slots: number; applicants: number; total_count: number;
};

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const entero = (v: string) => (/^\d+$/.test(v) ? Number(v) : null);

export default async function Trabajos({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const f: ValoresFiltro = {
    region: uno(sp.region), comuna: uno(sp.comuna), rubro: uno(sp.rubro), desde: uno(sp.desde),
    pagoMin: uno(sp.pago_min), texto: uno(sp.q).slice(0, 60), orden: uno(sp.orden) || "inicio",
  };
  const atajo = ATAJOS.some(([k]) => k === uno(sp.atajo)) ? uno(sp.atajo) : "";
  const pagina = Math.max(1, entero(uno(sp.pagina)) ?? 1);

  const supabase = await createClient();
  const [sesion, regsRes, comsRes, catsRes] = await Promise.all([
    obtenerSesion(),
    supabase.from("regions").select("id, name, sort_order").eq("active", true).order("sort_order"),
    supabase.from("comunas").select("id, name, region_id").eq("active", true).order("name"),
    supabase.from("categories").select("id, name").is("parent_id", null).eq("active", true).order("sort_order"),
  ]);
  const regiones = (regsRes.data ?? []).map((r) => ({ id: r.id as number, nombre: r.name as string }));
  const comunas = (comsRes.data ?? []).map((c) => ({ id: c.id as number, nombre: c.name as string, regionId: c.region_id as number }));
  const rubros = (catsRes.data ?? []).map((c) => ({ id: c.id as number, nombre: c.name as string }));

  // Comunas a filtrar: la elegida, o todas las de la región elegida.
  const comunaId = entero(f.comuna);
  const regionId = entero(f.region);
  const filtroComunas = comunaId
    ? [comunaId]
    : regionId
      ? comunas.filter((c) => c.regionId === regionId).map((c) => c.id)
      : null;

  const { data, error } = await supabase.rpc("search_jobs", {
    p_category: entero(f.rubro),
    p_comunas: filtroComunas,
    p_date_from: /^\d{4}-\d{2}-\d{2}$/.test(f.desde) ? f.desde : null,
    p_quick: atajo || null,
    p_min_hourly_clp: entero(f.pagoMin),
    p_text: f.texto.trim() || null,
    p_sort: ["inicio", "recientes", "tarifa"].includes(f.orden) ? f.orden : "inicio",
    p_limit: POR_PAGINA,
    p_offset: (pagina - 1) * POR_PAGINA,
  });
  const turnos = (data ?? []) as Turno[];
  const total = turnos[0]?.total_count ?? 0;
  const paginas = Math.ceil(total / POR_PAGINA);

  // Construye un link conservando los filtros actuales.
  const enlace = (cambios: Record<string, string | number | null>) => {
    const q = new URLSearchParams();
    const base: Record<string, string> = {
      region: f.region, comuna: f.comuna, rubro: f.rubro, desde: f.desde, pago_min: f.pagoMin, q: f.texto,
      orden: f.orden === "inicio" ? "" : f.orden, atajo, pagina: pagina > 1 ? String(pagina) : "",
    };
    for (const [k, v] of Object.entries({ ...base, ...cambios })) if (v !== null && v !== "") q.set(k, String(v));
    const s = q.toString();
    return s ? `/trabajos?${s}` : "/trabajos";
  };

  return (
    <div className="min-h-full bg-stone-50 text-stone-900">
      <Encabezado sesion={sesion} />

      <main className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="text-2xl font-bold tracking-tight">Buscar ofertas</h1>

        {sp.perfil === "listo" && sesion?.role === "trabajador" && (
          <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
            <p className="font-semibold">¡Tu perfil está listo!</p>
            <p className="mt-1">
              Ya puedes postular. Cada vez que postules, la empresa recibirá tu currículum y tus datos de contacto.{" "}
              <Link href="/trabajador/perfil?paso=perfil" className="font-medium underline">Editar mi perfil</Link>
            </p>
          </div>
        )}

        <nav aria-label="Atajos" className="mt-4 flex gap-2 overflow-x-auto pb-1">
          <Link
            href={enlace({ atajo: null, pagina: null })}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium ${!atajo ? "border-teal-700 bg-teal-700 text-white" : "border-stone-300 bg-white text-stone-700"}`}
          >
            Todos
          </Link>
          {ATAJOS.map(([k, t]) => (
            <Link
              key={k}
              href={enlace({ atajo: k, pagina: null })}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium ${atajo === k ? "border-teal-700 bg-teal-700 text-white" : "border-stone-300 bg-white text-stone-700 hover:border-teal-700"}`}
            >
              {t}
            </Link>
          ))}
        </nav>

        <div className="mt-4 grid gap-6 lg:grid-cols-[17rem_1fr]">
          <Filtros valores={f} atajo={atajo} regiones={regiones} comunas={comunas} rubros={rubros} />

          <section aria-live="polite" className="min-w-0">
            {error ? (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
                No pudimos cargar las ofertas. Recarga la página en un momento.
              </p>
            ) : turnos.length === 0 ? (
              <div className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center">
                <p className="font-semibold">No hay ofertas con estos filtros</p>
                <p className="mt-1 text-sm text-stone-600">Prueba con otra comuna, otra fecha o quita algún filtro.</p>
                <Link href="/trabajos" className="mt-4 inline-block font-medium text-teal-800 underline">
                  Ver todas las ofertas
                </Link>
              </div>
            ) : (
              <>
                <p className="text-sm text-stone-600 tabular-nums">
                  {total === 1 ? "1 oferta disponible" : `${total} ofertas disponibles`}
                </p>
                <ul className="mt-3 space-y-3">
                  {turnos.map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/trabajos/${t.id}`}
                        className="block rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-teal-700 focus-visible:outline-2 focus-visible:outline-teal-700 sm:p-5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                              {t.parent_category ? `${t.parent_category} · ${t.category}` : t.category}
                            </p>
                            <h2 className="mt-1 text-lg font-bold leading-snug">{t.title}</h2>
                            <p className="text-sm text-stone-600">
                              {t.business_name}
                              {t.business_verified && <span className="ml-1 font-medium text-teal-800">· Verificado</span>}
                              {t.comuna && <> · {t.comuna}</>}
                            </p>
                          </div>
                          {t.is_urgent && (
                            <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                              Urgente
                            </span>
                          )}
                        </div>
                        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-stone-100 pt-3 text-sm tabular-nums sm:grid-cols-4">
                          <div>
                            <dt className="text-stone-500">Cuándo</dt>
                            <dd className="font-semibold first-letter:uppercase">{diaRelativo(t.starts_at)}</dd>
                          </div>
                          <div>
                            <dt className="text-stone-500">Horario</dt>
                            <dd className="font-semibold">
                              {hora(t.starts_at)} a {hora(t.ends_at)} <span className="font-normal text-stone-500">({duracion(t.duration_minutes)})</span>
                            </dd>
                          </div>
                          <div>
                            <dt className="text-stone-500">Pago total</dt>
                            <dd className="font-semibold">{clp(t.estimated_total_clp)}</dd>
                          </div>
                          <div>
                            <dt className="text-stone-500">Por hora</dt>
                            <dd className="font-semibold">{clp(t.hourly_equivalent_clp)}</dd>
                          </div>
                        </dl>
                        <p className="mt-3 text-xs text-stone-500">
                          {t.slots === 1 ? "1 cupo" : `${t.slots} cupos`} ·{" "}
                          {t.applicants === 0 ? "Sin postulantes aún" : t.applicants === 1 ? "1 postulante" : `${t.applicants} postulantes`}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>

                {paginas > 1 && (
                  <nav aria-label="Páginas" className="mt-6 flex items-center justify-between text-sm">
                    {pagina > 1 ? (
                      <Link href={enlace({ pagina: pagina - 1 === 1 ? null : pagina - 1 })} className="rounded-lg border border-stone-300 bg-white px-4 py-2 font-medium">
                        Anterior
                      </Link>
                    ) : <span />}
                    <span className="text-stone-600 tabular-nums">Página {pagina} de {paginas}</span>
                    {pagina < paginas ? (
                      <Link href={enlace({ pagina: pagina + 1 })} className="rounded-lg border border-stone-300 bg-white px-4 py-2 font-medium">
                        Siguiente
                      </Link>
                    ) : <span />}
                  </nav>
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
