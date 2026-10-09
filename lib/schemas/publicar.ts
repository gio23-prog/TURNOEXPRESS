import { z } from "zod";
import { erroresPorCampo } from "./auth";

// Mismas 5 preguntas que las columnas q_* de job_posts. El riesgo real lo calcula
// public.compute_labor_risk() en la base de datos; esto es solo orientativo.
// `riesgoSi` indica qué respuesta suma un indicio de relación laboral.
export const PREGUNTAS_MODALIDAD = [
  { id: "q_autonomy", texto: "¿La persona decide por sí misma cómo realizar el trabajo?", riesgoSi: false },
  { id: "q_direct_supervision", texto: "¿Trabajará bajo supervisión directa de alguien de la empresa?", riesgoSi: true },
  { id: "q_imposed_schedule", texto: "¿La empresa fija el horario exacto de trabajo?", riesgoSi: true },
  { id: "q_continuous_instructions", texto: "¿Recibirá instrucciones continuas durante el turno?", riesgoSi: true },
  { id: "q_core_recurring", texto: "¿Es una tarea habitual del negocio que se repite con frecuencia?", riesgoSi: true },
] as const;

export type Borrador = {
  categoria: string; // id de la subcategoría (tabla categories)
  titulo: string;
  descripcion: string;
  cupos: string;
  fecha: string;
  inicio: string;
  termino: string;
  comuna: string; // id de la comuna (tabla comunas)
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
  categoria: z.string().regex(/^\d+$/, "Elige una categoría"),
  titulo: z.string().trim().min(5, "Escribe un título de al menos 5 caracteres").max(80, "Máximo 80 caracteres"),
  descripcion: z.string().trim().min(20, "Describe el trabajo en al menos 20 caracteres").max(1000, "Máximo 1000 caracteres"),
  cupos: z.number().int("Debe ser un número entero").min(1, "Mínimo 1 cupo").max(20, "Máximo 20 cupos"),
});

export const paso2 = z
  .object({
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elige una fecha"),
    inicio: hora,
    termino: hora,
    comuna: z.string().regex(/^\d+$/, "Elige una comuna"),
    direccion: z.string().trim().min(5, "Escribe la dirección exacta").max(200, "Máximo 200 caracteres"),
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
  const indicios = PREGUNTAS_MODALIDAD.filter((p) => r[p.id] === p.riesgoSi).length;
  return indicios >= 3 ? "alto" : indicios === 2 ? "medio" : "bajo";
}

/** La base exige confirmar la advertencia con riesgo medio o alto (publish_job). */
export function requiereAdvertencia(r: Borrador["respuestas"]): boolean {
  return nivelRiesgo(r) !== "bajo";
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
  return res.success ? {} : erroresPorCampo(res.error.issues);
}

export function validarTodo(d: Borrador): Record<string, string> {
  const e = { ...validarPaso(0, d), ...validarPaso(1, d), ...validarPaso(2, d), ...validarPaso(3, d) };
  if (requiereAdvertencia(d.respuestas) && !d.confirmaAdvertencia) {
    e.confirmaAdvertencia = "Confirma que leíste la advertencia";
  }
  return e;
}