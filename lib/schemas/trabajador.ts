import { z } from "zod";
import { campoRut, campoTelefono } from "@/lib/schemas/empresa";

const texto = (min: number, max: number, msg: string) => z.string().trim().min(min, msg).max(max, `Máximo ${max} caracteres`);

/** Datos personales: privados. Solo los ve el trabajador y el equipo de TurnoExpress. */
export const datosPersonalesSchema = z.object({
  nombre: texto(5, 120, "Escribe tu nombre y apellidos").refine((v) => v.trim().split(/\s+/).length >= 2, "Escribe nombre y apellido"),
  telefono: campoTelefono,
  rut: campoRut("RUT inválido. Revisa el dígito verificador"),
  region: z.string().regex(/^\d+$/, "Elige una región"),
  comuna: z.string().regex(/^\d+$/, "Elige una comuna"),
  direccion: texto(5, 200, "Escribe tu dirección (calle y número)"),
});
export type DatosPersonalesInput = z.input<typeof datosPersonalesSchema>;

export const registroTrabajadorSchema = datosPersonalesSchema.extend({
  email: z.string().trim().toLowerCase().email("Ingresa un correo válido"),
  password: z.string().min(8, "Mínimo 8 caracteres").max(72, "Máximo 72 caracteres"),
  consentimiento: z.boolean().refine((v) => v === true, "Debes aceptar los términos para continuar"),
});
export type RegistroTrabajadorInput = z.input<typeof registroTrabajadorSchema>;

export function errores<T>(schema: z.ZodType<T>, d: unknown): Record<string, string> {
  const r = schema.safeParse(d);
  if (r.success) return {};
  const out: Record<string, string> = {};
  for (const i of r.error.issues) out[String(i.path[0])] ??= i.message;
  return out;
}

/** "María José Pérez Soto" → "María P." (nombre visible por defecto). */
export function nombreVisiblePorDefecto(nombre: string) {
  const [n, a] = nombre.trim().split(/\s+/);
  return a ? `${n} ${a[0].toUpperCase()}.` : n;
}
