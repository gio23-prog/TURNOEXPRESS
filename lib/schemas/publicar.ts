import { z } from "zod";

// TODO: reemplazar por consultas a las tablas `categories` y `comunas` de Supabase.
export const CATEGORIAS = [
  "Garzón/a",
  "Cocina",
  "Barra",
  "Aseo",
  "Bodega y reposición",
  "Atención en tienda",
  "Evento",
] as const;
export const COMUNAS = ["Santiago", "Providencia", "Las Condes", "Ñuñoa", "Maipú", "La Florida"] as const;

// TODO: alinear estas 5 preguntas con CUMPLIMIENTO_LEGAL.md. La base de datos es la
// autoridad: el riesgo real debe recalcularlo la RPC, esto es solo orientativo.
export const PREGUNTAS_MODALIDAD = [
  { id: "horarioFijo", texto: "¿La empresa fija el horario exacto de trabajo?" },
  { id: "instrucciones", texto: "¿Trabajará bajo instrucciones o supervisión directa de la empresa?" },
  { id: "equipamiento", texto: "¿La empresa entrega uniforme, herramientas o equipo?" },
  { id: "reemplazo", texto: "¿El turno reemplaza a alguien del equipo que no puede asistir?" },
  { id: "repetido", texto: "¿Se repetirá con la misma persona más de una vez?" },
] as const;

export type Borrador = {
  categoria: string;
  titulo: string;
  descripcion: string;
  cupos: string;
  fecha: string;
  inicio: string;
  termino: string;
  comuna: string;
  direccion: string;
  urgente: boolean;
  modoPago: "total" | "hora";
  monto: string;
  pausas: string;
  vestimenta: string;
  alimentacion: boolean;
  transporte: boolean;
  respuestas: Record<string, boolean | undefined>;
  confirmaAdvertencia: boolean;
};

const hora = z.string().regex(/^\d{2}:\d{2}$/, "Ingresa una hora válida");

export const paso1 = z.object({
  categoria: z.string().min(1, "Elige una categoría"),
  titulo: z.string().trim().min(5, "Escribe un título de al menos 5 caracteres").max(80, "Máximo 80 caracteres"),
  descripcion: z.string().trim().min(20, "Describe el trabajo en al menos 20 caracteres").max(1000, "Máximo 1000 caracteres"),
  cupos: z.number().int("Debe ser un número entero").min(1, "Mínimo 1 cupo").max(20, "Máximo 20 cupos"),
});

export const paso2 = z
  .object({
    fecha: z.string().min(1, "Elige una fecha"),
    inicio: hora,
    termino: hora,
    comuna: z.string().min(1, "Elige una comuna"),
    direccion: z.string().trim().min(5, "Escribe la dirección exacta"),
  })
  .refine((d) => d.inicio !== d.termino, { message: "El término no puede ser igual al inicio", path: ["termino"] });

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
  return (((ht * 60 + mt) - (hi * 60 + mi)) + 1440) % 1440; // si cruza medianoche, suma un día (máx. 24 h)
}

export function calcularPago(d: Pick<Borrador, "modoPago" | "monto" | "inicio" | "termino">) {
  const horas = calcularDuracion(d.inicio, d.termino) / 60;
  const monto = Number(d.monto);
  if (!horas || !monto) return { total: 0, valorHora: 0 };
  return d.modoPago === "total"
    ? { total: monto, valorHora: Math.round(monto / horas) }
    : { total: Math.round(monto * horas), valorHora: monto };
}

export function nivelRiesgo(r: Borrador["respuestas"]): "bajo" | "medio" | "alto" {
  const si = PREGUNTAS_MODALIDAD.filter((p) => r[p.id] === true).length;
  return si >= 3 ? "alto" : si === 2 ? "medio" : "bajo";
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
  if (nivelRiesgo(d.respuestas) === "alto" && !d.confirmaAdvertencia) {
    e.confirmaAdvertencia = "Confirma que leíste la advertencia";
  }
  return e;
}