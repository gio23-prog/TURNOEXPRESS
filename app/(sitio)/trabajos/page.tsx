import type { Metadata } from "next";
import Link from "next/link";
import { createClient, supabaseConfigurado } from "@/lib/supabase/server";
import { clp, duracion, horario } from "@/lib/formato";

export const metadata: Metadata = { title: "Buscar turnos" };

const POR_PAGINA = 20;

// Valores aceptados por search_jobs(p_quick). "cerca" y "proyecto" se omiten: el
// primero depende de coordenadas de comunas aún no cargadas; el segundo filtra
// "pago total", que no equivale a un proyecto.
const RAPIDOS = [
  { id: "hoy", texto: "Hoy" },
  { id: "manana", texto: "Mañana" },
  { id: "finde", texto: "Fin de semana" },
  { id: "pocas_horas", texto: "Hasta 4 horas" },
  { id: "un_dia", texto: "Jornada (6 h o más)" },
];
const ORDENES = [
  { id: "inicio", texto: "Próximos primero" },
  { id: "recientes", texto: "Publicados recientemente" },
  { id: "tarifa", texto: "Mejor valor hora" },
];

type Turno = {
  id: string;
  title: string;
  category: string;
  parent_category: string | null;
  business_name: string;
  business_verified: boolean;
  comuna: string | null;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  pay_type: "total" | "por_hora";
  hourly_equivalent_clp: number;
  estimated_total_clp: number;
  is_urgent: boolean;
  slots: number;
  applicants: number;
  total_count: number;
};

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const entero = (v: string) => (/^\d+$/.test(v) ? Number(v) : null);

const input =
  "w-full rounded-lg border border-borde-fuerte bg-white px-3 py-2 text-marino focus:outline-none focus:ring-2 focus:ring-turquesa";

export default async function Trabajos({ searchParams }: PageProps<"/trabajos">) {
  const sp = await searchParams;
  const f = {
    categoria: uno(sp.categoria),
    comuna: uno(sp.comuna),
    rapido: RAPIDOS.some((r) => r.id === uno(sp.rapido)) ? uno(sp.rapido) : "",
    q: uno(sp.q).trim().slice(0, 80),
    min: uno(sp.min),
    urgente: uno(sp.urgente) === "1",
    orden: ORDENES.some((o) => o.id === uno(sp.orden)) ? uno(sp.orden) : "inicio",
    pagina: Math.max(1, entero(uno(sp.pagina)) ?? 1),
  };

  if (!supabaseConfigurado()) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Aviso texto="La búsqueda no está disponible: falta configurar Supabase." />
      </main>
    );
  }

  const supabase = await createClient();
  const [{ data: categorias }, { data: comunas }, { data, error }] = await Promise.all([
    supabase.from("categories").select("id, name").is("parent_id", null).order("sort_order"),
    supabase.from("comunas").select("id, name").eq("active", true).order("name"),
    supabase.rpc("search_jobs", {
      p_category: entero(f.categoria),
      p_comunas: entero(f.comuna) ? [entero(f.comuna)] : null,
      p_quick: f.rapido || null,
      p_text: f.q || null,
      p_min_hourly_clp: entero(f.min),
      p_urgent_only: f.urgente,
      p_sort: f.orden,
      p_limit: POR_PAGINA,
      p_offset: (f.pagina - 1) * POR_PAGINA,
    }),
  ]);

  const filtrosActivos = [f.categoria, f.comuna, f.rapido, f.min, f.urgente, f.orden !== "inicio"].filter(Boolean).length;
  const turnos = (data ?? []) as Turno[];
  const total = turnos[0]?.total_count ?? 0;
  const paginas = Math.ceil(total / POR_PAGINA);

  const enlacePagina = (n: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...f, urgente: f.urgente ? "1" : "", pagina: n > 1 ? String(n) : "" }))
      if (v && !(k === "orden" && v === "inicio")) q.set(k, String(v));
    return `/trabajos${q.size ? `?${q}` : ""}`;
  };

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
      <h1 className="text-2xl font-semibold text-marino">Buscar turnos</h1>

      <form method="get" className="mt-4 rounded-lg border border-borde bg-fondo-suave p-4">
        <div className="flex gap-2">
          <label className="block flex-1">
            <span className="sr-only">Buscar</span>
            <input name="q" defaultValue={f.q} maxLength={80} placeholder="Ej: garzón, bodega, evento" className={input} />
          </label>
          <button className="shrink-0 rounded-lg bg-turquesa-oscuro px-5 py-2 font-medium text-white hover:bg-turquesa-hover">Buscar</button>
        </div>

        {/* Abierto si hay filtros activos, para que se vea qué se está aplicando. */}
        <details open={filtrosActivos > 0} className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-turquesa-oscuro">
            Más filtros{filtrosActivos > 0 && ` (${filtrosActivos} activo${filtrosActivos > 1 ? "s" : ""})`}
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-texto-suave">Categoría</span>
              <select name="categoria" defaultValue={f.categoria} className={input}>
                <option value="">Todas</option>
                {(categorias ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-texto-suave">Comuna</span>
              <select name="comuna" defaultValue={f.comuna} className={input}>
                <option value="">Todas</option>
                {(comunas ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-texto-suave">Cuándo / duración</span>
              <select name="rapido" defaultValue={f.rapido} className={input}>
                <option value="">Cualquiera</option>
                {RAPIDOS.map((r) => <option key={r.id} value={r.id}>{r.texto}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-texto-suave">Valor hora mínimo (CLP)</span>
              <input name="min" type="number" inputMode="numeric" min={0} step={500} defaultValue={f.min} className={input} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-texto-suave">Ordenar por</span>
              <select name="orden" defaultValue={f.orden} className={input}>
                {ORDENES.map((o) => <option key={o.id} value={o.id}>{o.texto}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-texto-suave sm:pt-6">
              <input type="checkbox" name="urgente" value="1" defaultChecked={f.urgente} /> Solo urgentes
            </label>
          </div>
          <div className="mt-3 flex gap-3">
            <button className="rounded-lg bg-turquesa-oscuro px-5 py-2 font-medium text-white hover:bg-turquesa-hover">Aplicar filtros</button>
            <Link href="/trabajos" className="rounded-lg px-3 py-2 text-sm font-medium text-texto-suave underline">Limpiar filtros</Link>
          </div>
        </details>
      </form>

      {error ? (
        <Aviso texto="No pudimos cargar los turnos. Intenta de nuevo en unos minutos." />
      ) : turnos.length === 0 ? (
        <Aviso texto="No hay turnos que coincidan con tu búsqueda. Prueba con menos filtros." />
      ) : (
        <>
          <p className="mt-6 text-sm text-texto-suave">{total === 1 ? "1 turno disponible" : `${total} turnos disponibles`}</p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {turnos.map((t) => (
              <li key={t.id}>
                <Link href={`/trabajos/${t.id}`} className="block h-full rounded-lg border border-borde bg-white p-4 hover:border-turquesa">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-medium text-marino">{t.title}</h2>
                    {t.is_urgent && <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">Urgente</span>}
                  </div>
                  <p className="mt-1 text-sm text-texto-suave">
                    {t.business_name}
                    {t.business_verified && <span className="ml-1 text-turquesa-oscuro">· Verificada</span>}
                  </p>
                  <p className="mt-2 text-sm text-marino">{horario(t.starts_at, t.ends_at)} ({duracion(t.duration_minutes)})</p>
                  <p className="text-sm text-texto-suave">
                    {[t.comuna, t.parent_category ? `${t.parent_category} › ${t.category}` : t.category].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-2 font-medium text-marino">
                    {clp(t.estimated_total_clp)} <span className="text-sm font-normal text-texto-suave">· {clp(t.hourly_equivalent_clp)} por hora</span>
                  </p>
                  <p className="mt-1 text-xs text-texto-tenue">
                    {t.slots === 1 ? "1 cupo" : `${t.slots} cupos`} · {t.applicants === 1 ? "1 postulación" : `${t.applicants} postulaciones`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          {paginas > 1 && (
            <nav aria-label="Páginas" className="mt-6 flex items-center justify-between text-sm">
              {f.pagina > 1 ? <Link href={enlacePagina(f.pagina - 1)} className="font-medium text-turquesa-oscuro underline">Anterior</Link> : <span />}
              <span className="text-texto-suave">Página {f.pagina} de {paginas}</span>
              {f.pagina < paginas ? <Link href={enlacePagina(f.pagina + 1)} className="font-medium text-turquesa-oscuro underline">Siguiente</Link> : <span />}
            </nav>
          )}
        </>
      )}
    </main>
  );
}

function Aviso({ texto }: { texto: string }) {
  return <p className="mt-6 rounded-lg border border-borde bg-fondo-suave p-4 text-sm text-texto-suave">{texto}</p>;
}
