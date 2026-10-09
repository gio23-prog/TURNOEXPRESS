import { z } from "zod";

// Mismos límites que la tabla applications (message y highlighted_experience ≤ 500).
export const postularSchema = z.object({
  disponible: z.boolean().refine((v) => v === true, "Confirma que tienes disponibilidad para todo el turno"),
  mensaje: z.string().trim().max(500, "Máximo 500 caracteres"),
  experiencia: z.string().trim().max(500, "Máximo 500 caracteres"),
  aceptaAviso: z.boolean().refine((v) => v === true, "Debes leer y aceptar el aviso para postular"),
});

export type PostularInput = z.infer<typeof postularSchema>;
