import { z } from "zod";

// Las categorías y comunas se cargan desde Supabase (tablas `categories` y `comunas`).
export type Categoria = { id: number; nombre: string; subcategorias: { id: number; nombre: string }[] };
export type Comuna = { id: number; nombre: string };

// Deben coincidir con las columnas q_* de job_posts y con compute_labor_risk() en la base.
// "indicaSi" = la respuesta que suma un indicio de relación laboral.
// Es solo orientativo: el riesgo oficial lo calcula la base de datos al guardar.
export const PREGUNTAS_MODALIDAD = [
  { id: "q_autonomy", texto: "¿La persona podrá organizar por sí misma cómo hace el trabajo?", indicaSi: false },
  { id: "q_direct_supervision", texto: "¿Alguien de tu equipo la supervisará directamente durante el turno?", indicaSi: true },
  { id: "q_imposed_schedule", texto: "¿Tú fijas el horario exacto de entrada y salida?", indicaSi: true },
  { id: "q_continuous_instructions", texto: "¿Recibirá instrucciones continuas mientras trabaja?", indicaSi: true },
  { id: "q_core_recurring", texto: "¿Es una tarea habitual de tu negocio que se repetirá con frecuencia?", indicaSi: true },
] as const;

export type PreguntaId = (typeof PREGUNTAS_MODALIDAD)[number]["id"];

export type Borrador = {
  categoria: string; // id de subcategoría
  titulo: string;
  descripcion: string;
  cupos: string;
  fecha: string; // AAAA-MM-DD (input date)
  inicio: string; // HH:MM
  termino: string; // HH:MM
  comuna: string; // id de comuna
  direccion: string;
  urgente: boolean;
  modoPago: "total" | "hora";
  monto: string;
  pausas: string;
  vestimenta: string;
  alimentacion: boolean;
  transporte: boolean;
  respuestas: Partial<Record<PreguntaId, boolean>>;
  confirmaAdvertencia: boolean;
};

const hora = z.string().regex(/^\d{2}:\d{2}$/, "Ingresa una hora válida");
const idNumerico = (msg: string) => z.string().regex(/^\d+$/, msg);

export const paso1 = z.object({
  categoria: idNumerico("Elige una categoría"),
  titulo: z.string().trim().min(5, "Escribe un título de al menos 5 caracteres").max(80, "Máximo 80 caracteres"),
  descripcion: z.string().trim().min(20, "Describe el trabajo en al menos 20 caracteres").max(1000, "Máximo 1000 caracteres"),
  cupos: z.number().int("Debe ser un número entero").min(1, "Mínimo 1 cupo").max(20, "Máximo 20 cupos"),
});

export const paso2 = z
  .object({
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elige una fecha"),
    inicio: hora,
    termino: hora,
    comuna: idNumerico("Elige una comuna"),
    direccion: z.string().trim().min(5, "Escribe la dirección exacta").max(200, "Máximo 200 caracteres"),
  })
  .refine((d) => d.inicio !== d.termino, { message: "El término no puede ser igual al inicio", path: ["termino"] })
  .refine((d) => new Date(horaChileAISO(d.fecha, d.inicio)).getTime() > Date.now() + 30 * 60_000, {
    message: "El turno debe comenzar al menos 30 minutos desde ahora",
    path: ["inicio"],
  });

export const paso3 = z.object({
  monto: z.number().int("Sin decimales").min(1, "Ingresa un monto").max(10_000_000, "Monto demasiado alto"),
  pausas: z.string().max(200, "Máximo 200 caracteres"),
  vestimenta: z.string().max(200, "Máximo 200 caracteres"),
});

// ---------- Helpers ----------

export function calcularDuracion(inicio: string, termino: string): number {
  const [hi, mi] = inicio.split(":").map(Number);
  const [ht, mt] = termino.split(":").map(Number);
  if ([hi, mi, ht, mt].some((n) => Number.isNaN(n))) return 0;
  return (ht * 60 + mt - (hi * 60 + mi) + 1440) % 1440; // si cruza medianoche, termina al día siguiente
}

export function calcularPago(d: Pick<Borrador, "modoPago" | "monto" | "inicio" | "termino">) {
  const horas = calcularDuracion(d.inicio, d.termino) / 60;
  const monto = Number(d.monto);
  if (!horas || !monto) return { total: 0, valorHora: 0 };
  return d.modoPago === "total"
    ? { total: monto, valorHora: Math.round(monto / horas) }
    : { total: Math.round(monto * horas), valorHora: monto };
}

/** Misma regla que compute_labor_risk() en la base: 3+ indicios = alto, 2 = medio. */
export function nivelRiesgo(r: Borrador["respuestas"]): "bajo" | "medio" | "alto" {
  const indicios = PREGUNTAS_MODALIDAD.filter((p) => r[p.id] !== undefined && r[p.id] === p.indicaSi).length;
  return indicios >= 3 ? "alto" : indicios === 2 ? "medio" : "bajo";
}

/** La base exige confirmar la advertencia en riesgo medio y alto. */
export const requiereAviso = (r: Borrador["respuestas"]) => nivelRiesgo(r) !== "bajo";

function offsetSantiago(fecha: Date): number {
  const nombre =
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", timeZoneName: "longOffset" })
      .formatToParts(fecha)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = nombre.match(/GMT([+-])(\d{2}):(\d{2})/);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

/** Fecha y hora de Chile (con horario de verano) a ISO UTC. */
export function horaChileAISO(fecha: string, horaTxt: string, diasExtra = 0): string {
  const [y, mo, d] = fecha.split("-").map(Number);
  const [h, mi] = horaTxt.split(":").map(Number);
  const local = Date.UTC(y, mo - 1, d + diasExtra, h, mi);
  let t = local - offsetSantiago(new Date(local)) * 60_000;
  t = local - offsetSantiago(new Date(t)) * 60_000;
  return new Date(t).toISOString();
}

/** Inicio y término en ISO; si el término es menor que el inicio, cruza medianoche. */
export function rangoTurno(d: Pick<Borrador, "fecha" | "inicio" | "termino">) {
  const cruza = d.termino <= d.inicio;
  return { inicio: horaChileAISO(d.fecha, d.inicio), termino: horaChileAISO(d.fecha, d.termino, cruza ? 1 : 0) };
}

function aMapa(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? "form");
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

/** Valida un paso (0 a 3). Se usa en el formulario y en la Server Action. */
export function validarPaso(n: number, d: Borrador): Record<string, string> {
  if (n === 3) {
    const e: Record<string, string> = {};
    for (const p of PREGUNTAS_MODALIDAD) if (d.respuestas[p.id] === undefined) e[p.id] = "Responde sí o no";
    return e;
  }
  const res =
    n === 0
      ? paso1.safeParse({ categoria: d.categoria, titulo: d.titulo, descripcion: d.descripcion, cupos: Number(d.cupos) })
      : n === 1
        ? paso2.safeParse({ fecha: d.fecha, inicio: d.inicio, termino: d.termino, comuna: d.comuna, direccion: d.direccion })
        : paso3.safeParse({ monto: Number(d.monto), pausas: d.pausas, vestimenta: d.vestimenta });
  return res.success ? {} : aMapa(res.error.issues);
}

export function validarTodo(d: Borrador): Record<string, string> {
  const e = { ...validarPaso(0, d), ...validarPaso(1, d), ...validarPaso(2, d), ...validarPaso(3, d) };
  if (requiereAviso(d.respuestas) && !d.confirmaAdvertencia) {
    e.confirmaAdvertencia = "Confirma que leíste la advertencia";
  }
  return e;
}
