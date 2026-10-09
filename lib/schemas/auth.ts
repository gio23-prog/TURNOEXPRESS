import { z } from "zod";

export const registroSchema = z.object({
  tipo: z.enum(["trabajador", "empresa"]),
  nombre: z.string().trim().min(2, "Escribe tu nombre").max(80, "Máximo 80 caracteres"),
  email: z.string().trim().toLowerCase().email("Ingresa un correo válido"),
  password: z.string().min(8, "Mínimo 8 caracteres").max(72, "Máximo 72 caracteres"),
  consentimiento: z.boolean().refine((v) => v === true, "Debes aceptar los términos para continuar"),
  mayorEdad: z.boolean().refine((v) => v === true, "Debes ser mayor de 18 años para registrarte"),
});

export const ingresoSchema = z.object({
  email: z.string().trim().toLowerCase().email("Ingresa un correo válido"),
  password: z.string().min(1, "Ingresa tu contraseña"),
});

export type RegistroInput = z.infer<typeof registroSchema>;
export type IngresoInput = z.infer<typeof ingresoSchema>;

export function erroresPorCampo(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? "form");
    if (!out[k]) out[k] = i.message;
  }
  return out;
}