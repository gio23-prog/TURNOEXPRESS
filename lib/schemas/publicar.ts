import { z } from "zod";
import { problemaTexto, problemaTitulo, type TipoContrato } from "@/lib/reglas-publicacion";

// Las categorías y comunas se cargan desde Supabase (tablas `categories` y `comunas`).
export type Categoria = { id: number; nombre: string; subcategorias: { id: number; nombre: string }[] };
export type Region = { id: number; nombre: string };
export type Comuna = { id: number; nombre: string; regionId: number };

// Deben coincidir con las columnas q_* de job_posts y con compute_labor_risk() en la base.
// "indicaSi" = la respuesta que suma un indicio de relación laboral.
// Es solo orientativo: el riesgo oficial lo calcula la base de datos al guardar.
export const PREGUNTAS_MODALIDAD = [
  {
    id: "q_autonomy", indicaSi: false,
    texto: "¿La persona podrá organizar por sí misma cómo hace el trabajo?",
    ayuda: "Sí: decide cómo y en qué orden hacerlo, con sus propios métodos (ej.: armador de muebles con sus herramientas). No: tu equipo le indica cómo hacerlo (ej.: garzón que sigue las indicaciones del encargado).",
  },
  {
    id: "q_direct_supervision", indicaSi: true,
    texto: "¿Alguien de tu equipo la supervisará directamente durante el turno?",
    ayuda: "Sí: un jefe de turno o encargado revisa y corrige su trabajo mientras lo hace. No: solo revisas el resultado al final.",
  },
  {
    id: "q_imposed_schedule", indicaSi: true,
    texto: "¿Tú fijas el horario exacto de entrada y salida?",
    ayuda: "Sí: debe llegar y salir a una hora que tú defines (ej.: de 18:00 a 00:00). No: solo hay un plazo de entrega (ej.: \"terminar antes del viernes\").",
  },
  {
    id: "q_continuous_instructions", indicaSi: true,
    texto: "¿Recibirá instrucciones continuas mientras trabaja?",
    ayuda: "Sí: le irán diciendo qué hacer durante el turno. No: recibe el encargo al inicio y lo ejecuta a su manera.",
  },
  {
    id: "q_core_recurring", indicaSi: true,
    texto: "¿Es una tarea habitual de tu negocio que se repetirá con frecuencia?",
    ayuda: "Sí: es parte del día a día del negocio (ej.: garzones en un restaurante, cajeros en una tienda). No: es un servicio puntual o especializado (ej.: reparar una máquina).",
  },
] as const;

export type PreguntaId = (typeof PREGUNTAS_MODALIDAD)[number]["id"];

// ---------- Preguntas del empleador (filtro de postulantes) ----------

export type TipoPregunta = "si_no" | "opcion" | "texto";
export type PreguntaEmpleador = {
  texto: string;
  tipo: TipoPregunta;
  opciones: string; // una por línea (solo para "opcion")
  obligatoria: boolean;
  excluyentes: string[]; // "si" | "no" | opciones que descartan
};

export const MAX_PREGUNTAS = 5;
export const MAX_LARGO_PREGUNTA = 500;

export const SUGERENCIAS_PREGUNTAS: Omit<PreguntaEmpleador, "obligatoria" | "excluyentes">[] = [
  { texto: "¿Tienes experiencia en este tipo de trabajo?", tipo: "si_no", opciones: "" },
  { texto: "¿Cuántos años de experiencia tienes en el cargo?", tipo: "opcion", opciones: "Menos de 1 año\n1 a 3 años\nMás de 3 años" },
  { texto: "¿Puedes emitir boleta de honorarios electrónica?", tipo: "si_no", opciones: "" },
  { texto: "¿Cuentas con el uniforme o vestimenta indicada?", tipo: "si_no", opciones: "" },
  { texto: "Cuéntanos brevemente tu experiencia más reciente", tipo: "texto", opciones: "" },
];

// Temas que no se deben preguntar: la ley chilena prohíbe discriminar por ellos.
const TEMAS_SENSIBLES: [RegExp, string][] = [
  [/\bedad\b|cu[aá]ntos a[nñ]os tienes|a[nñ]o de nacimiento/i, "edad"],
  [/embaraz|hijos|estado civil|casad[oa]|solter[oa]/i, "situación familiar o embarazo"],
  [/religi|iglesia|creencia/i, "religión"],
  [/enfermedad|salud|discapacidad|licencia m[eé]dica|vih/i, "salud o discapacidad"],
  [/sindica/i, "afiliación sindical"],
  [/sexo|g[eé]nero|orientaci[oó]n sexual/i, "sexo u orientación sexual"],
  [/pol[ií]tic|partido/i, "opinión política"],
  [/raza|etnia|color de piel/i, "origen étnico"],
];

export function temaSensible(texto: string): string | null {
  return TEMAS_SENSIBLES.find(([re]) => re.test(texto))?.[1] ?? null;
}

export function opcionesDe(p: Pick<PreguntaEmpleador, "opciones">): string[] {
  return [...new Set(p.opciones.split("\n").map((o) => o.trim()).filter(Boolean))];
}

/** Errores por pregunta, con clave "pregunta-<n>". Mismas reglas que la tabla job_questions. */
export function validarPreguntas(ps: PreguntaEmpleador[]): Record<string, string> {
  const e: Record<string, string> = {};
  if (ps.length > MAX_PREGUNTAS) e.preguntas = `Máximo ${MAX_PREGUNTAS} preguntas`;
  ps.forEach((p, i) => {
    const k = `pregunta-${i}`;
    const t = p.texto.trim();
    const contenido = problemaTexto(`${t} ${p.tipo === "opcion" ? p.opciones : ""}`);
    if (t.length < 5) e[k] = "Escribe la pregunta (mínimo 5 caracteres)";
    else if (contenido) e[k] = contenido;
    else if (t.length > MAX_LARGO_PREGUNTA) e[k] = `Máximo ${MAX_LARGO_PREGUNTA} caracteres`;
    else if (p.tipo === "opcion") {
      const ops = opcionesDe(p);
      if (ops.length < 2 || ops.length > 6) e[k] = "Escribe entre 2 y 6 opciones, una por línea";
      else if (ops.some((o) => o.length > 80)) e[k] = "Cada opción puede tener máximo 80 caracteres";
      else if (p.excluyentes.some((x) => !ops.includes(x))) e[k] = "Revisa las respuestas excluyentes";
      else if (p.excluyentes.length >= ops.length) e[k] = "Al menos una opción no debe ser excluyente";
    } else if (p.tipo === "si_no" && p.excluyentes.length > 1) {
      e[k] = "Solo una respuesta puede ser excluyente";
    }
  });
  return e;
}

export type Borrador = {
  categoria: string; // id de subcategoría
  titulo: string;
  descripcion: string;
  cupos: string;
  fecha: string; // AAAA-MM-DD (input date)
  inicio: string; // HH:MM
  termino: string; // HH:MM
  region: string; // id de región (solo para filtrar comunas en el formulario)
  comuna: string; // id de comuna
  direccion: string;
  urgente: boolean;
  modoPago: "total" | "hora";
  monto: string;
  pausas: string;
  vestimenta: string;
  alimentacion: boolean;
  transporte: boolean;
  preguntas: PreguntaEmpleador[];
  respuestas: Partial<Record<PreguntaId, boolean>>;
  contrato: TipoContrato | "";
  declaraVeracidad: boolean;
  aceptaCondiciones: boolean;
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
    region: idNumerico("Elige una región"),
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
export const requiereAviso = (d: Pick<Borrador, "contrato" | "respuestas">) =>
  d.contrato === "honorarios" && nivelRiesgo(d.respuestas) !== "bajo";

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

/** Pasos: 0 Qué · 1 Cuándo y dónde · 2 Pago · 3 Preguntas · 4 Modalidad. Se usa en el formulario y en la Server Action. */
export function validarPaso(n: number, d: Borrador): Record<string, string> {
  if (n === 3) return validarPreguntas(d.preguntas);
  if (n === 4) {
    const e: Record<string, string> = {};
    if (!d.contrato) e.contrato = "Elige cómo vas a contratar este turno";
    // El cuestionario de modalidad solo aplica a la boleta de honorarios.
    if (d.contrato === "honorarios") {
      for (const p of PREGUNTAS_MODALIDAD) if (d.respuestas[p.id] === undefined) e[p.id] = "Responde sí o no";
      if (!d.declaraVeracidad) e.declaraVeracidad = "Confirma que las respuestas describen cómo se hará realmente el trabajo";
    }
    return e;
  }
  const res =
    n === 0
      ? paso1.safeParse({ categoria: d.categoria, titulo: d.titulo, descripcion: d.descripcion, cupos: Number(d.cupos) })
      : n === 1
        ? paso2.safeParse({ fecha: d.fecha, inicio: d.inicio, termino: d.termino, region: d.region, comuna: d.comuna, direccion: d.direccion })
        : paso3.safeParse({ monto: Number(d.monto), pausas: d.pausas, vestimenta: d.vestimenta });
  const e = res.success ? {} : aMapa(res.error.issues);
  // Normas de publicación (mismas reglas que aplica la base al publicar).
  const revisar: [string, string | null][] =
    n === 0
      ? [["titulo", problemaTitulo(d.titulo)], ["descripcion", problemaTexto(d.descripcion)]]
      : n === 1
        ? []
        : [["pausas", problemaTexto(d.pausas)], ["vestimenta", problemaTexto(d.vestimenta)]];
  for (const [k, msg] of revisar) if (msg && !e[k]) e[k] = msg;
  return e;
}

export function validarTodo(d: Borrador): Record<string, string> {
  const e = { ...validarPaso(0, d), ...validarPaso(1, d), ...validarPaso(2, d), ...validarPaso(3, d), ...validarPaso(4, d) };
  if (!d.aceptaCondiciones) e.aceptaCondiciones = "Debes aceptar las condiciones del empleador para publicar";
  if (requiereAviso(d) && !d.confirmaAdvertencia) {
    e.confirmaAdvertencia = "Confirma que leíste la advertencia";
  }
  return e;
}
