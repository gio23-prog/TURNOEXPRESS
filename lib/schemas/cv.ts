import { z } from "zod";

// Validaciones del CV estructurado. Reflejan las restricciones de la migración 18.

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const hoyMes = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const texto = (min: number, max: number, msg: string) => z.string().trim().min(min, msg).max(max, `Máximo ${max} caracteres`);
const opcional = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`);

export const NIVELES_FORMACION = [
  ["basica", "Enseñanza básica"], ["media", "Enseñanza media"], ["tecnica", "Técnico"],
  ["universitaria", "Universitaria"], ["postgrado", "Postgrado o diplomado"], ["curso", "Curso o certificación"], ["otro", "Otro"],
] as const;
export const NIVELES_IDIOMA = [["basico", "Básico"], ["intermedio", "Intermedio"], ["avanzado", "Avanzado"], ["nativo", "Nativo"]] as const;
export const IDIOMAS_COMUNES = ["Español", "Inglés", "Portugués", "Francés", "Alemán", "Italiano", "Chino mandarín", "Creole haitiano", "Lengua de señas chilena"];

export const resumenSchema = z.object({
  titular: opcional(80),
  descripcion: opcional(1000),
  anios: z.string().regex(/^\d{0,2}$/, "Indica los años como número"),
  emiteBoleta: z.boolean(),
});
export type ResumenInput = z.input<typeof resumenSchema>;

/** Valida el periodo: inicio obligatorio o no, término posterior, nada en el futuro. */
function periodo<T extends { inicio: string; termino: string; actual: boolean }>(d: T, ctx: z.RefinementCtx, inicioObligatorio: boolean) {
  if (inicioObligatorio && !MES.test(d.inicio)) ctx.addIssue({ code: "custom", path: ["inicio"], message: "Indica el mes y año de inicio" });
  if (d.inicio && !MES.test(d.inicio)) ctx.addIssue({ code: "custom", path: ["inicio"], message: "Fecha inválida" });
  if (d.inicio && d.inicio > hoyMes()) ctx.addIssue({ code: "custom", path: ["inicio"], message: "El inicio no puede ser futuro" });
  if (!d.actual && inicioObligatorio && !MES.test(d.termino)) {
    ctx.addIssue({ code: "custom", path: ["termino"], message: "Indica cuándo terminó o marca que sigue actualmente" });
  }
  if (!d.actual && d.termino) {
    if (!MES.test(d.termino)) ctx.addIssue({ code: "custom", path: ["termino"], message: "Fecha inválida" });
    else if (d.inicio && d.termino < d.inicio) ctx.addIssue({ code: "custom", path: ["termino"], message: "El término no puede ser anterior al inicio" });
  }
}

export const experienciaSchema = z.object({
  id: z.string().uuid().optional(),
  cargo: texto(2, 100, "Escribe el cargo"),
  empresa: texto(2, 120, "Escribe la empresa"),
  funciones: opcional(500),
  lugar: opcional(100),
  inicio: z.string(),
  termino: z.string(),
  actual: z.boolean(),
}).superRefine((d, ctx) => periodo(d, ctx, true));
export type ExperienciaInput = z.input<typeof experienciaSchema>;

export const formacionSchema = z.object({
  id: z.string().uuid().optional(),
  institucion: texto(2, 150, "Escribe la institución"),
  titulo: opcional(150),
  nivel: z.enum(["basica", "media", "tecnica", "universitaria", "postgrado", "curso", "otro"]),
  inicio: z.string(),
  termino: z.string(),
  actual: z.boolean(),
}).superRefine((d, ctx) => periodo(d, ctx, false));
export type FormacionInput = z.input<typeof formacionSchema>;

export const idiomasSchema = z.array(z.object({
  idioma: texto(2, 40, "Escribe el idioma"),
  nivel: z.enum(["basico", "intermedio", "avanzado", "nativo"]),
})).max(10, "Máximo 10 idiomas")
  .refine((l) => new Set(l.map((x) => x.idioma.trim().toLowerCase())).size === l.length, "Hay idiomas repetidos");

export const habilidadesSchema = z.array(texto(2, 40, "Cada habilidad debe tener al menos 2 caracteres"))
  .max(30, "Máximo 30 habilidades");

export const movilidadSchema = z.object({ viajar: z.boolean(), residencia: z.boolean(), vehiculo: z.boolean() });
export type MovilidadInput = z.infer<typeof movilidadSchema>;

export const preferenciasSchema = z.object({
  rubros: z.array(z.number().int()).max(7),
  comunas: z.array(z.number().int()).max(60, "Máximo 60 comunas"),
});
export type PreferenciasInput = z.infer<typeof preferenciasSchema>;

/** "2019-04" → "abr 2019" */
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function mesAnio(ym: string | null | undefined) {
  if (!ym || !MES.test(ym.slice(0, 7))) return "";
  return `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
}
export function periodoTexto(inicio: string | null, termino: string | null, actual: boolean) {
  const a = mesAnio(inicio), b = actual ? "actualidad" : mesAnio(termino);
  return a && b ? `${a} – ${b}` : a ? `desde ${a}` : b;
}
export const NOMBRE_NIVEL_FORMACION = Object.fromEntries(NIVELES_FORMACION) as Record<string, string>;
export const NOMBRE_NIVEL_IDIOMA = Object.fromEntries(NIVELES_IDIOMA) as Record<string, string>;
