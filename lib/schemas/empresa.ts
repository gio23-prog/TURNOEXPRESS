import { z } from "zod";
import { formatearRut, rutValido } from "@/lib/rut";

const texto = (min: number, max: number, msgMin: string) =>
  z.string().trim().min(min, msgMin).max(max, `Máximo ${max} caracteres`);

const rut = (msg: string) =>
  z.string().trim().refine(rutValido, msg).transform(formatearRut);

/** Teléfono chileno: acepta "9 1234 5678", "+56 9 1234 5678", etc. y lo deja como +569XXXXXXXX. */
const telefono = z
  .string()
  .transform((v) => v.replace(/\D/g, "").replace(/^56/, ""))
  .refine((v) => /^\d{9}$/.test(v), "Ingresa un teléfono de 9 dígitos, por ejemplo 9 1234 5678")
  .transform((v) => `+56${v}`);

export const empresaSchema = z.object({
  // Empresa
  nombreComercial: texto(2, 120, "Escribe el nombre con que te conocen los clientes"),
  razonSocial: texto(2, 160, "Escribe la razón social tal como aparece en el SII"),
  rutEmpresa: rut("RUT de la empresa inválido. Revisa el dígito verificador"),
  giro: texto(3, 150, "Indica el giro registrado en el SII"),
  rubro: z.string().trim().max(60, "Máximo 60 caracteres"),
  descripcion: z.string().trim().max(1500, "Máximo 1500 caracteres"),
  // Dirección fiscal
  region: z.string().regex(/^\d+$/, "Elige una región"),
  comuna: z.string().regex(/^\d+$/, "Elige una comuna"),
  direccionFiscal: texto(5, 200, "Escribe la dirección fiscal (calle y número)"),
  // Representante legal
  repNombre: texto(3, 120, "Escribe el nombre completo del representante legal"),
  repRut: rut("RUT del representante legal inválido"),
  // Persona a cargo
  contactoNombre: texto(3, 120, "Escribe el nombre de la persona a cargo"),
  contactoCargo: texto(2, 80, "Indica su cargo, por ejemplo Administrador"),
  contactoTelefono: telefono,
  contactoCorreo: z.string().trim().toLowerCase().email("Ingresa un correo válido"),
});

export type EmpresaInput = z.input<typeof empresaSchema>;

export function erroresEmpresa(d: EmpresaInput): Record<string, string> {
  const r = empresaSchema.safeParse(d);
  if (r.success) return {};
  const out: Record<string, string> = {};
  for (const i of r.error.issues) out[String(i.path[0])] ??= i.message;
  return out;
}
