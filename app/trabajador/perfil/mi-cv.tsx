"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Campo, campo } from "@/app/registro/trabajador";
import { Aviso } from "./formularios";
import {
  borrarExperiencia, borrarFormacion, guardarExperiencia, guardarFormacion, guardarHabilidades, guardarIdiomas,
  guardarMovilidad, guardarPreferencias, guardarResumen, importarDesdeCV,
} from "./cv-actions";
import {
  experienciaSchema, formacionSchema, IDIOMAS_COMUNES, NIVELES_FORMACION, NIVELES_IDIOMA, NOMBRE_NIVEL_FORMACION,
  NOMBRE_NIVEL_IDIOMA, periodoTexto, resumenSchema,
  type ExperienciaInput, type FormacionInput, type MovilidadInput, type ResumenInput,
} from "@/lib/schemas/cv";
import { errores } from "@/lib/schemas/trabajador";

type Opcion = { id: number; nombre: string };
type Comuna = Opcion & { regionId: number };
type Msg = { ok: boolean; texto: string } | null;
type Res = { ok: boolean; mensaje: string; errores?: Record<string, string> };

export type DatosCV = {
  contacto: { nombre: string; telefono: string; correo: string; comuna: string };
  resumen: ResumenInput;
  experiencias: (ExperienciaInput & { id: string })[];
  formacion: (FormacionInput & { id: string })[];
  idiomas: { idioma: string; nivel: string }[];
  habilidades: string[];
  movilidad: MovilidadInput;
  rubrosSel: number[];
  comunasSel: number[];
  cv: { subido: string | null } | null;
};

const btnPrimario = "rounded-lg bg-teal-700 px-5 py-2.5 font-semibold text-white hover:bg-teal-800 disabled:opacity-60";
const btnSecundario = "rounded-lg border border-stone-300 bg-white px-5 py-2.5 font-medium text-stone-800 hover:bg-stone-50";

// ------------------------------------------------------------------ Piezas comunes
function Lapiz() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" />
    </svg>
  );
}
function Mas() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function Tarjeta({ titulo, accion, consejo, children }: {
  titulo: ReactNode; accion?: { tipo: "editar" | "agregar"; onClick: () => void; etiqueta: string };
  consejo?: string; children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold">{titulo}</h2>
          {accion && (
            <button type="button" onClick={accion.onClick} aria-label={accion.etiqueta}
              className="-m-1 rounded-lg p-1 text-stone-700 hover:bg-stone-100 hover:text-teal-800">
              {accion.tipo === "editar" ? <Lapiz /> : <Mas />}
            </button>
          )}
        </div>
        <div className="mt-3">{children}</div>
      </div>
      {consejo && (
        <p className="flex gap-2 border-t border-stone-100 bg-stone-50 px-5 py-3 text-sm text-stone-600">
          <span aria-hidden>💡</span>{consejo}
        </p>
      )}
    </section>
  );
}

function Interruptor({ id, activo, onChange, children }: { id: string; activo: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-3 text-sm font-medium text-stone-800">
      <button id={id} type="button" role="switch" aria-checked={activo} onClick={() => onChange(!activo)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${activo ? "bg-teal-700" : "bg-stone-300"}`}>
        <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition ${activo ? "left-6" : "left-1"}`} />
      </button>
      {children}
    </label>
  );
}

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
/** Selector de mes y año ("AAAA-MM"). Dos listas: funciona igual en todos los teléfonos. */
function SelectorMes({ id, valor, onChange, disabled }: { id: string; valor: string; onChange: (v: string) => void; disabled?: boolean }) {
  const anioActual = new Date().getFullYear();
  const [a, m] = valor ? valor.split("-") : ["", ""];
  const cambiar = (anio: string, mes: string) => onChange(anio && mes ? `${anio}-${mes}` : anio ? `${anio}-${mes || "01"}` : "");
  return (
    <div className="flex gap-2">
      <select id={id} aria-label="Mes" className={campo} value={m} disabled={disabled} onChange={(e) => cambiar(a || String(anioActual), e.target.value)}>
        <option value="">Mes</option>
        {MESES.map((n, i) => <option key={n} value={String(i + 1).padStart(2, "0")}>{n}</option>)}
      </select>
      <select aria-label="Año" className={campo} value={a} disabled={disabled} onChange={(e) => cambiar(e.target.value, m)}>
        <option value="">Año</option>
        {Array.from({ length: anioActual - 1959 }, (_, i) => anioActual - i).map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}

/** Ejecuta una acción del servidor, muestra el resultado y refresca la página si salió bien. */
function useAccion() {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [err, setErr] = useState<Record<string, string>>({});
  const ejecutar = (fn: () => Promise<Res>, alTerminar?: () => void) =>
    iniciar(async () => {
      const r = await fn();
      setErr(r.errores ?? {});
      setMsg({ ok: r.ok, texto: r.mensaje });
      if (r.ok) { router.refresh(); alTerminar?.(); }
    });
  return { pendiente, msg, setMsg, err, setErr, ejecutar };
}

function Botones({ pendiente, onCancelar, onBorrar }: { pendiente: boolean; onCancelar: () => void; onBorrar?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <button disabled={pendiente} className={btnPrimario}>{pendiente ? "Guardando..." : "Guardar"}</button>
      <button type="button" onClick={onCancelar} className={btnSecundario}>Cancelar</button>
      {onBorrar && (
        <button type="button" disabled={pendiente} onClick={onBorrar} className="ml-auto px-2 py-2.5 text-sm font-medium text-red-700 underline">
          Eliminar
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Componente principal
export default function MiCV({ datos, rubros, regiones, comunas, importarAlAbrir }: {
  datos: DatosCV; rubros: Opcion[]; regiones: Opcion[]; comunas: Comuna[]; importarAlAbrir: boolean;
}) {
  const router = useRouter();
  const [importando, iniciarImportacion] = useTransition();
  const [msgImport, setMsgImport] = useState<Msg>(null);
  const importar = () => iniciarImportacion(async () => {
    const r = await importarDesdeCV();
    setMsgImport({ ok: r.ok, texto: r.mensaje });
    router.refresh();
  });
  const vacio = !datos.resumen.titular && !datos.experiencias.length && !datos.formacion.length && !datos.habilidades.length;
  const yaImportado = useRef(false);
  useEffect(() => {
    if (importarAlAbrir && datos.cv && vacio && !yaImportado.current) { yaImportado.current = true; importar(); }
    // Solo al llegar desde la primera subida del CV.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      {datos.cv && (
        <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-950">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>
              <span className="font-semibold">Completa tu CV con tu currículum en PDF.</span> Solo llenamos las secciones vacías;
              después puedes corregir todo.
            </p>
            <button type="button" disabled={importando} onClick={importar} className={`${btnPrimario} shrink-0`}>
              {importando ? "Leyendo tu currículum..." : "Completar con mi currículum"}
            </button>
          </div>
          {msgImport && <div className="mt-3"><Aviso msg={msgImport} /></div>}
        </div>
      )}

      <Contacto c={datos.contacto} />
      <Resumen inicial={datos.resumen} />
      <Experiencias lista={datos.experiencias} />
      <Formacion lista={datos.formacion} />
      <Idiomas inicial={datos.idiomas} />
      <Habilidades inicial={datos.habilidades} />
      <Movilidad inicial={datos.movilidad} />
      <Preferencias rubros={rubros} regiones={regiones} comunas={comunas} rubrosSel={datos.rubrosSel} comunasSel={datos.comunasSel} />
      <CurriculumAdjunto cv={datos.cv} />

      <div className="rounded-2xl border border-stone-200 bg-white p-5 text-center">
        <p className="font-semibold">¿Listo? Tu CV se guarda sección por sección.</p>
        <Link href="/trabajos" className={`${btnPrimario} mt-3 inline-block`}>Buscar ofertas</Link>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Contacto
function Contacto({ c }: { c: DatosCV["contacto"] }) {
  const filas: [string, string][] = [
    ["📱", c.telefono ? c.telefono.replace(/^\+56(\d)(\d{4})(\d{4})$/, "+56 $1 $2 $3") : "Sin teléfono"],
    ["✉️", c.correo],
    ["📍", c.comuna ? `${c.comuna}, Chile` : "Sin comuna"],
  ];
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-bold">{c.nombre}</h2>
        <Link href="/trabajador/perfil?paso=datos" aria-label="Editar datos personales"
          className="-m-1 rounded-lg p-1 text-stone-700 hover:bg-stone-100 hover:text-teal-800"><Lapiz /></Link>
      </div>
      <ul className="mt-3 space-y-2">
        {filas.map(([icono, t]) => (
          <li key={icono} className="flex items-center gap-3">
            <span aria-hidden className="flex size-9 items-center justify-center rounded-lg bg-stone-100">{icono}</span>
            <span className="min-w-0 break-words text-stone-800">{t}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-stone-500">La empresa ve tu nombre, teléfono y correo solo cuando postulas a una de sus ofertas.</p>
    </section>
  );
}

// ------------------------------------------------------------------ Titular y descripción
function Resumen({ inicial }: { inicial: ResumenInput }) {
  const [editando, setEditando] = useState(false);
  const [d, setD] = useState(inicial);
  const { pendiente, msg, err, setErr, ejecutar } = useAccion();

  function enviar(e: FormEvent) {
    e.preventDefault();
    const e1 = errores(resumenSchema, d);
    setErr(e1);
    if (Object.keys(e1).length) return;
    ejecutar(() => guardarResumen(d), () => setEditando(false));
  }

  return (
    <Tarjeta titulo={inicial.titular || "Cargo o título profesional"}
      accion={editando ? undefined : { tipo: "editar", onClick: () => { setD(inicial); setEditando(true); }, etiqueta: "Editar resumen" }}
      consejo={!inicial.descripcion ? "Una descripción detallada de tu perfil te ayuda a destacar entre otros postulantes." : undefined}>
      {editando ? (
        <form onSubmit={enviar} noValidate className="space-y-4">
          <Campo id="titular" label="Cargo o título profesional" ayuda="Ej: Asistente de operaciones, Garzón, Técnico en logística." error={err.titular}>
            <input id="titular" className={campo} maxLength={80} value={d.titular} onChange={(e) => setD({ ...d, titular: e.target.value })} />
          </Campo>
          <Campo id="descripcion" label="Sobre ti" ayuda={`${d.descripcion.length}/1000 · En qué eres bueno y cómo trabajas.`} error={err.descripcion}>
            <textarea id="descripcion" rows={5} maxLength={1000} className={campo} value={d.descripcion}
              onChange={(e) => setD({ ...d, descripcion: e.target.value })} />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="anios" label="Años de experiencia" error={err.anios}>
              <input id="anios" inputMode="numeric" maxLength={2} className={campo} value={d.anios}
                onChange={(e) => setD({ ...d, anios: e.target.value.replace(/\D/g, "") })} />
            </Campo>
            <div className="self-end pb-2">
              <Interruptor id="boleta" activo={d.emiteBoleta} onChange={(v) => setD({ ...d, emiteBoleta: v })}>
                Puedo emitir boleta de honorarios
              </Interruptor>
            </div>
          </div>
          <Aviso msg={msg?.ok ? null : msg} />
          <Botones pendiente={pendiente} onCancelar={() => { setD(inicial); setEditando(false); }} />
        </form>
      ) : (
        <div className="space-y-2 text-stone-700">
          {inicial.descripcion ? <p className="whitespace-pre-line">{inicial.descripcion}</p>
            : <p className="text-stone-500">Aún no escribes una descripción.</p>}
          <p className="text-sm text-stone-600">
            {inicial.anios ? `${inicial.anios} ${inicial.anios === "1" ? "año" : "años"} de experiencia` : "Años de experiencia sin indicar"}
            {inicial.emiteBoleta && " · Emite boleta de honorarios"}
          </p>
        </div>
      )}
    </Tarjeta>
  );
}

// ------------------------------------------------------------------ Experiencia
const EXP_VACIA: ExperienciaInput = { cargo: "", empresa: "", funciones: "", lugar: "", inicio: "", termino: "", actual: false };

function Experiencias({ lista }: { lista: (ExperienciaInput & { id: string })[] }) {
  const [editando, setEditando] = useState<string | "nueva" | null>(null);
  const actual = editando === "nueva" ? EXP_VACIA : lista.find((x) => x.id === editando);
  return (
    <Tarjeta titulo="Experiencia profesional"
      accion={editando ? undefined : { tipo: "agregar", onClick: () => setEditando("nueva"), etiqueta: "Añadir experiencia" }}
      consejo="Añade las experiencias relacionadas con las ofertas que te interesan y actualízalas periódicamente.">
      {actual ? (
        <FormExperiencia key={editando} inicial={actual} onCerrar={() => setEditando(null)} />
      ) : (
        <>
          <Linea items={lista.map((x) => ({
            id: x.id, titulo: x.cargo, sub: x.empresa, fecha: periodoTexto(x.inicio, x.termino, x.actual), detalle: x.funciones,
          }))} onEditar={setEditando} vacio="Aún no agregas experiencias." />
          <button type="button" onClick={() => setEditando("nueva")} className="mt-3 w-full text-center font-medium text-teal-800 hover:underline">
            Añadir experiencia
          </button>
        </>
      )}
    </Tarjeta>
  );
}

function FormExperiencia({ inicial, onCerrar }: { inicial: ExperienciaInput; onCerrar: () => void }) {
  const [d, setD] = useState(inicial);
  const { pendiente, msg, err, setErr, ejecutar } = useAccion();
  const set = <K extends keyof ExperienciaInput>(k: K, v: ExperienciaInput[K]) => setD((p) => ({ ...p, [k]: v }));
  function enviar(e: FormEvent) {
    e.preventDefault();
    const e1 = errores(experienciaSchema, d);
    setErr(e1);
    if (Object.keys(e1).length) return;
    ejecutar(() => guardarExperiencia(d), onCerrar);
  }
  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <Campo id="exp-cargo" label="Cargo" error={err.cargo}>
        <input id="exp-cargo" className={campo} maxLength={100} value={d.cargo} onChange={(e) => set("cargo", e.target.value)} />
      </Campo>
      <Campo id="exp-empresa" label="Empresa" error={err.empresa}>
        <input id="exp-empresa" className={campo} maxLength={120} value={d.empresa} onChange={(e) => set("empresa", e.target.value)} />
      </Campo>
      <Campo id="exp-funciones" label="Funciones y logros del cargo" ayuda={`${d.funciones.length}/500`} error={err.funciones}>
        <textarea id="exp-funciones" rows={4} maxLength={500} className={campo} value={d.funciones} onChange={(e) => set("funciones", e.target.value)} />
      </Campo>
      <Campo id="exp-lugar" label="Lugar (opcional)" error={err.lugar}>
        <input id="exp-lugar" className={campo} maxLength={100} value={d.lugar} placeholder="Ej: Pudahuel, Santiago" onChange={(e) => set("lugar", e.target.value)} />
      </Campo>
      <Interruptor id="exp-actual" activo={d.actual} onChange={(v) => setD((p) => ({ ...p, actual: v, termino: v ? "" : p.termino }))}>
        Actualmente trabajo aquí
      </Interruptor>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="exp-inicio" label="Inicio" error={err.inicio}>
          <SelectorMes id="exp-inicio" valor={d.inicio} onChange={(v) => set("inicio", v)} />
        </Campo>
        {!d.actual && (
          <Campo id="exp-termino" label="Término" error={err.termino}>
            <SelectorMes id="exp-termino" valor={d.termino} onChange={(v) => set("termino", v)} />
          </Campo>
        )}
      </div>
      <Aviso msg={msg?.ok ? null : msg} />
      <Botones pendiente={pendiente} onCancelar={onCerrar}
        onBorrar={inicial.id ? () => ejecutar(() => borrarExperiencia(inicial.id!), onCerrar) : undefined} />
    </form>
  );
}

// ------------------------------------------------------------------ Formación
const FORM_VACIA: FormacionInput = { institucion: "", titulo: "", nivel: "tecnica", inicio: "", termino: "", actual: false };

function Formacion({ lista }: { lista: (FormacionInput & { id: string })[] }) {
  const [editando, setEditando] = useState<string | "nueva" | null>(null);
  const actual = editando === "nueva" ? FORM_VACIA : lista.find((x) => x.id === editando);
  return (
    <Tarjeta titulo="Formación"
      accion={editando ? undefined : { tipo: "agregar", onClick: () => setEditando("nueva"), etiqueta: "Añadir formación" }}
      consejo="Muestra a las empresas tu preparación: estudios, cursos y certificaciones.">
      {actual ? (
        <FormFormacion key={editando} inicial={actual} onCerrar={() => setEditando(null)} />
      ) : (
        <>
          <Linea items={lista.map((x) => ({
            id: x.id, titulo: x.titulo || x.institucion, sub: x.titulo ? x.institucion : NOMBRE_NIVEL_FORMACION[x.nivel],
            fecha: periodoTexto(x.inicio, x.termino, x.actual),
          }))} onEditar={setEditando} vacio="Aún no agregas tu formación." />
          <button type="button" onClick={() => setEditando("nueva")} className="mt-3 w-full text-center font-medium text-teal-800 hover:underline">
            Añadir formación
          </button>
        </>
      )}
    </Tarjeta>
  );
}

function FormFormacion({ inicial, onCerrar }: { inicial: FormacionInput; onCerrar: () => void }) {
  const [d, setD] = useState(inicial);
  const { pendiente, msg, err, setErr, ejecutar } = useAccion();
  const set = <K extends keyof FormacionInput>(k: K, v: FormacionInput[K]) => setD((p) => ({ ...p, [k]: v }));
  function enviar(e: FormEvent) {
    e.preventDefault();
    const e1 = errores(formacionSchema, d);
    setErr(e1);
    if (Object.keys(e1).length) return;
    ejecutar(() => guardarFormacion(d), onCerrar);
  }
  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <Campo id="edu-institucion" label="Institución" error={err.institucion}>
        <input id="edu-institucion" className={campo} maxLength={150} value={d.institucion} placeholder="Ej: Universidad Mayor, Liceo A-90"
          onChange={(e) => set("institucion", e.target.value)} />
      </Campo>
      <Campo id="edu-titulo" label="Título o carrera (opcional)" error={err.titulo}>
        <input id="edu-titulo" className={campo} maxLength={150} value={d.titulo} onChange={(e) => set("titulo", e.target.value)} />
      </Campo>
      <Campo id="edu-nivel" label="Nivel" error={err.nivel}>
        <select id="edu-nivel" className={campo} value={d.nivel} onChange={(e) => set("nivel", e.target.value as FormacionInput["nivel"])}>
          {NIVELES_FORMACION.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
        </select>
      </Campo>
      <Interruptor id="edu-actual" activo={d.actual} onChange={(v) => setD((p) => ({ ...p, actual: v, termino: v ? "" : p.termino }))}>
        Estudio aquí actualmente
      </Interruptor>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="edu-inicio" label="Inicio (opcional)" error={err.inicio}>
          <SelectorMes id="edu-inicio" valor={d.inicio} onChange={(v) => set("inicio", v)} />
        </Campo>
        {!d.actual && (
          <Campo id="edu-termino" label="Término (opcional)" error={err.termino}>
            <SelectorMes id="edu-termino" valor={d.termino} onChange={(v) => set("termino", v)} />
          </Campo>
        )}
      </div>
      <Aviso msg={msg?.ok ? null : msg} />
      <Botones pendiente={pendiente} onCancelar={onCerrar}
        onBorrar={inicial.id ? () => ejecutar(() => borrarFormacion(inicial.id!), onCerrar) : undefined} />
    </form>
  );
}

/** Lista con línea de tiempo (experiencia y formación). */
function Linea({ items, onEditar, vacio }: {
  items: { id: string; titulo: string; sub: string; fecha: string; detalle?: string }[];
  onEditar: (id: string) => void; vacio: string;
}) {
  if (!items.length) return <p className="text-stone-500">{vacio}</p>;
  return (
    <ol className="relative">
      {items.map((x, k) => (
        <li key={x.id} className="relative flex gap-3 pb-5 last:pb-0">
          {k < items.length - 1 && <span aria-hidden className="absolute left-[11px] top-6 h-full w-0.5 bg-stone-200" />}
          <span aria-hidden className="relative z-10 mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-teal-50 ring-4 ring-white">
            <span className="size-3 rounded-full bg-teal-700" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-snug">{x.titulo}</p>
            <p className="text-stone-700">{x.sub}</p>
            {x.fecha && <p className="text-sm text-stone-500 first-letter:uppercase">{x.fecha}</p>}
            {x.detalle && <p className="mt-1 line-clamp-2 text-sm text-stone-600">{x.detalle}</p>}
          </div>
          <button type="button" onClick={() => onEditar(x.id)} aria-label={`Editar ${x.titulo}`}
            className="h-fit rounded-lg p-1 text-stone-700 hover:bg-stone-100 hover:text-teal-800"><Lapiz /></button>
        </li>
      ))}
    </ol>
  );
}

// ------------------------------------------------------------------ Idiomas
function Idiomas({ inicial }: { inicial: { idioma: string; nivel: string }[] }) {
  const [editando, setEditando] = useState(false);
  const [lista, setLista] = useState(inicial);
  const { pendiente, msg, ejecutar } = useAccion();
  const cambiar = (i: number, k: "idioma" | "nivel", v: string) => setLista((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  return (
    <Tarjeta titulo="Idiomas" accion={editando ? undefined : { tipo: "editar", onClick: () => { setLista(inicial); setEditando(true); }, etiqueta: "Editar idiomas" }}>
      {editando ? (
        <form onSubmit={(e) => { e.preventDefault(); ejecutar(() => guardarIdiomas(lista.filter((x) => x.idioma.trim())), () => setEditando(false)); }}
          className="space-y-3">
          <datalist id="lista-idiomas">{IDIOMAS_COMUNES.map((i) => <option key={i} value={i} />)}</datalist>
          {lista.map((x, i) => (
            <div key={i} className="flex gap-2">
              <input aria-label="Idioma" list="lista-idiomas" className={campo} maxLength={40} value={x.idioma}
                onChange={(e) => cambiar(i, "idioma", e.target.value)} placeholder="Idioma" />
              <select aria-label="Nivel" className={`${campo} max-w-36`} value={x.nivel} onChange={(e) => cambiar(i, "nivel", e.target.value)}>
                {NIVELES_IDIOMA.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select>
              <button type="button" aria-label={`Quitar ${x.idioma || "idioma"}`} onClick={() => setLista((l) => l.filter((_, j) => j !== i))}
                className="shrink-0 rounded-lg px-3 text-stone-500 hover:bg-stone-100">✕</button>
            </div>
          ))}
          {lista.length < 10 && (
            <button type="button" onClick={() => setLista((l) => [...l, { idioma: "", nivel: "basico" }])} className="font-medium text-teal-800 hover:underline">
              + Agregar idioma
            </button>
          )}
          <Aviso msg={msg?.ok ? null : msg} />
          <Botones pendiente={pendiente} onCancelar={() => { setLista(inicial); setEditando(false); }} />
        </form>
      ) : inicial.length ? (
        <ul className="flex flex-wrap gap-2">
          {inicial.map((x) => (
            <li key={x.idioma} className="rounded-full bg-stone-100 px-4 py-2 text-stone-800">{x.idioma} - {NOMBRE_NIVEL_IDIOMA[x.nivel]}</li>
          ))}
        </ul>
      ) : (
        <p className="text-stone-500">Aún no agregas idiomas.</p>
      )}
    </Tarjeta>
  );
}

// ------------------------------------------------------------------ Habilidades
function Habilidades({ inicial }: { inicial: string[] }) {
  const [editando, setEditando] = useState(false);
  const [lista, setLista] = useState(inicial);
  const [nueva, setNueva] = useState("");
  const [verTodas, setVerTodas] = useState(false);
  const { pendiente, msg, setMsg, ejecutar } = useAccion();

  const agregar = () => {
    const h = nueva.trim();
    if (h.length < 2) return;
    if (lista.length >= 30) { setMsg({ ok: false, texto: "Máximo 30 habilidades." }); return; }
    if (!lista.some((x) => x.toLowerCase() === h.toLowerCase())) setLista((l) => [...l, h.slice(0, 40)]);
    setNueva("");
  };
  const visibles = verTodas ? inicial : inicial.slice(0, 8);

  return (
    <Tarjeta titulo="Competencias y habilidades"
      accion={editando ? undefined : { tipo: "editar", onClick: () => { setLista(inicial); setEditando(true); }, etiqueta: "Editar habilidades" }}
      consejo="Las empresas buscan perfiles según sus conocimientos y habilidades: agrega los que tengas.">
      {editando ? (
        <form onSubmit={(e) => { e.preventDefault(); ejecutar(() => guardarHabilidades(lista), () => setEditando(false)); }} className="space-y-3">
          <ul className="flex flex-wrap gap-2">
            {lista.map((h) => (
              <li key={h}>
                <button type="button" onClick={() => setLista((l) => l.filter((x) => x !== h))} aria-label={`Quitar ${h}`}
                  className="rounded-full bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-900 ring-1 ring-teal-700/30 hover:bg-teal-100">
                  {h} ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input aria-label="Nueva habilidad" className={campo} maxLength={40} value={nueva} placeholder="Ej: Excel, Atención al cliente"
              onChange={(e) => setNueva(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregar(); } }} />
            <button type="button" onClick={agregar} className={`${btnSecundario} shrink-0`}>Agregar</button>
          </div>
          <Aviso msg={msg?.ok ? null : msg} />
          <Botones pendiente={pendiente} onCancelar={() => { setLista(inicial); setEditando(false); }} />
        </form>
      ) : inicial.length ? (
        <>
          <ul className="flex flex-wrap gap-2">
            {visibles.map((h) => <li key={h} className="rounded-full bg-stone-100 px-4 py-2 text-stone-800">{h}</li>)}
          </ul>
          {inicial.length > 8 && (
            <button type="button" onClick={() => setVerTodas((v) => !v)} className="mt-3 w-full text-center font-medium text-teal-800 hover:underline">
              {verTodas ? "Ver menos" : `Ver más (${inicial.length - 8})`}
            </button>
          )}
        </>
      ) : (
        <p className="text-stone-500">Aún no agregas habilidades.</p>
      )}
    </Tarjeta>
  );
}

// ------------------------------------------------------------------ Movilidad
function Movilidad({ inicial }: { inicial: MovilidadInput }) {
  const [d, setD] = useState(inicial);
  const { msg, ejecutar } = useAccion();
  const cambiar = (k: keyof MovilidadInput, v: boolean) => {
    const nuevo = { ...d, [k]: v };
    setD(nuevo);
    ejecutar(() => guardarMovilidad(nuevo)); // se guarda al instante
  };
  return (
    <Tarjeta titulo="Desplazamiento y movilidad">
      <div className="space-y-3">
        <Interruptor id="mov-viajar" activo={d.viajar} onChange={(v) => cambiar("viajar", v)}>Tengo disponibilidad para viajar</Interruptor>
        <Interruptor id="mov-residencia" activo={d.residencia} onChange={(v) => cambiar("residencia", v)}>
          Tengo disponibilidad para cambiar de residencia
        </Interruptor>
        <Interruptor id="mov-vehiculo" activo={d.vehiculo} onChange={(v) => cambiar("vehiculo", v)}>Tengo vehículo propio</Interruptor>
      </div>
      {msg && !msg.ok && <div className="mt-3"><Aviso msg={msg} /></div>}
    </Tarjeta>
  );
}

// ------------------------------------------------------------------ Rubros y comunas
function Preferencias({ rubros, regiones, comunas, rubrosSel, comunasSel }: {
  rubros: Opcion[]; regiones: Opcion[]; comunas: Comuna[]; rubrosSel: number[]; comunasSel: number[];
}) {
  const [editando, setEditando] = useState(false);
  const [r, setR] = useState(rubrosSel);
  const [c, setC] = useState(comunasSel);
  const [region, setRegion] = useState("");
  const { pendiente, msg, ejecutar } = useAccion();
  const nombreComuna = new Map(comunas.map((x) => [x.id, x.nombre]));
  const nombreRubro = new Map(rubros.map((x) => [x.id, x.nombre]));
  const alternar = (lista: number[], id: number) => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);

  return (
    <Tarjeta titulo="Rubros y comunas de interés"
      accion={editando ? undefined : { tipo: "editar", onClick: () => { setR(rubrosSel); setC(comunasSel); setEditando(true); }, etiqueta: "Editar rubros y comunas" }}>
      {editando ? (
        <form onSubmit={(e) => { e.preventDefault(); ejecutar(() => guardarPreferencias({ rubros: r, comunas: c }), () => setEditando(false)); }}
          className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-stone-700">Rubros en los que buscas trabajo</legend>
            <div className="flex flex-wrap gap-2">
              {rubros.map((x) => {
                const sel = r.includes(x.id);
                return (
                  <button key={x.id} type="button" aria-pressed={sel} onClick={() => setR((l) => alternar(l, x.id))}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                      sel ? "border-teal-700 bg-teal-700 text-white" : "border-stone-300 bg-white text-stone-700 hover:border-teal-700"}`}>
                    {x.nombre}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-stone-700">Comunas donde puedes trabajar</legend>
            {c.length > 0 && (
              <ul className="mb-3 flex flex-wrap gap-2">
                {c.map((id) => (
                  <li key={id}>
                    <button type="button" onClick={() => setC((l) => l.filter((x) => x !== id))} aria-label={`Quitar ${nombreComuna.get(id)}`}
                      className="rounded-full bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-900 ring-1 ring-teal-700/30 hover:bg-teal-100">
                      {nombreComuna.get(id)} ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <select aria-label="Región para agregar comunas" className={campo} value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="">Elige una región para agregar comunas</option>
              {regiones.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
            {region && (
              <div className="mt-2 grid max-h-56 grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto rounded-lg border border-stone-200 p-3 text-sm sm:grid-cols-3">
                {comunas.filter((x) => String(x.regionId) === region).map((x) => (
                  <label key={x.id} className="flex items-center gap-2">
                    <input type="checkbox" className="size-4" checked={c.includes(x.id)} onChange={() => setC((l) => alternar(l, x.id))} />
                    {x.nombre}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <Aviso msg={msg?.ok ? null : msg} />
          <Botones pendiente={pendiente} onCancelar={() => { setR(rubrosSel); setC(comunasSel); setEditando(false); }} />
        </form>
      ) : (
        <div className="space-y-2 text-stone-700">
          <p><span className="font-medium">Rubros: </span>{rubrosSel.length ? rubrosSel.map((id) => nombreRubro.get(id)).join(", ") : "sin elegir"}</p>
          <p><span className="font-medium">Comunas: </span>{comunasSel.length ? comunasSel.map((id) => nombreComuna.get(id)).join(", ") : "sin elegir"}</p>
        </div>
      )}
    </Tarjeta>
  );
}

// ------------------------------------------------------------------ Currículum adjunto
function CurriculumAdjunto({ cv }: { cv: DatosCV["cv"] }) {
  return (
    <Tarjeta titulo="Currículum adjunto"
      consejo={cv ? "Tu currículum en PDF se envía automáticamente a las ofertas a las que postules." : undefined}>
      {cv ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-stone-50 p-3">
          <a href="/trabajador/perfil/cv" target="_blank" rel="noopener" className="flex items-center gap-3 font-semibold text-stone-900 hover:underline">
            <span aria-hidden className="rounded bg-red-600 px-1.5 py-1 text-xs font-bold text-white">PDF</span>
            Mi currículum{cv.subido && <span className="font-normal text-stone-500">· {cv.subido}</span>}
          </a>
          <Link href="/trabajador/perfil?paso=cv" className="text-sm font-medium text-teal-800 underline">Cambiar</Link>
        </div>
      ) : (
        <Link href="/trabajador/perfil?paso=cv" className="font-medium text-teal-800 underline">Subir mi currículum en PDF</Link>
      )}
    </Tarjeta>
  );
}
