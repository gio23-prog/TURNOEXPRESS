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

export const SECTORES = [
  "Gastronomía y restaurantes", "Hotelería y turismo", "Eventos y producción", "Comercio y retail",
  "Supermercados", "Logística y bodegaje", "Transporte", "Aseo y servicios generales", "Construcción",
  "Oficinas y servicios profesionales", "Salud", "Educación", "Agroindustria", "Manufactura", "Otro",
] as const;
// Tramos de tamaño de empresa por número de trabajadores (Ley 20.416).
export const TAMANOS = ["1 a 9", "10 a 49", "50 a 199", "200 o más"] as const;
export const TURNOS_MES = ["1 a 5", "6 a 20", "21 a 50", "Más de 50"] as const;

const deLista = <T extends readonly [string, ...string[]]>(lista: T, msg: string) =>
  z.string().refine((v): v is T[number] => (lista as readonly string[]).includes(v), msg);

export const empresaSchema = z.object({
  // Empresa
  nombreComercial: texto(2, 120, "Escribe el nombre con que te conocen los clientes"),
  razonSocial: texto(2, 160, "Escribe la razón social tal como aparece en el SII"),
  rutEmpresa: rut("RUT de la empresa inválido. Revisa el dígito verificador"),
  giro: texto(3, 150, "Indica el giro registrado en el SII"),
  rubro: z.string().trim().max(60, "Máximo 60 caracteres"),
  sector: deLista(SECTORES, "Elige el sector"),
  tamano: deLista(TAMANOS, "Elige el número de trabajadores"),
  turnosMes: deLista(TURNOS_MES, "Elige cuántos turnos publicarías al mes"),
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

/** Registro en un paso: datos de la empresa + contraseña y consentimiento. El correo de la cuenta es el de la persona a cargo. */
export const registroEmpresaSchema = empresaSchema.extend({
  password: z.string().min(8, "Mínimo 8 caracteres").max(72, "Máximo 72 caracteres"),
  consentimiento: z.boolean().refine((v) => v === true, "Debes aceptar los términos para continuar"),
});
export type RegistroEmpresaInput = z.input<typeof registroEmpresaSchema>;

/** Convierte datos ya validados a columnas de business_profiles. */
export function filaEmpresa(d: z.output<typeof empresaSchema>) {
  return {
    trade_name: d.nombreComercial,
    legal_name: d.razonSocial,
    rut: d.rutEmpresa,
    giro: d.giro,
    business_type: d.rubro || null,
    sector: d.sector,
    employees_range: d.tamano,
    shifts_per_month: d.turnosMes,
    description: d.descripcion || null,
    comuna_id: Number(d.comuna),
    fiscal_address: d.direccionFiscal,
    legal_rep_name: d.repNombre,
    legal_rep_rut: d.repRut,
    contact_name: d.contactoNombre,
    contact_position: d.contactoCargo,
    contact_phone: d.contactoTelefono,
    contact_email: d.contactoCorreo,
  };
}

export function erroresEmpresa(d: EmpresaInput | RegistroEmpresaInput, registro = false): Record<string, string> {
  const r = (registro ? registroEmpresaSchema : empresaSchema).safeParse(d);
  if (r.success) return {};
  const out: Record<string, string> = {};
  for (const i of r.error.issues) out[String(i.path[0])] ??= i.message;
  return out;
}

export { rut as campoRut, telefono as campoTelefono };
