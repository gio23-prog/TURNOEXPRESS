// Condiciones que el empleador acepta al publicar cada turno.
// BORRADOR: debe revisarlo un abogado antes del lanzamiento.
// Si cambias el texto, sube CONDICIONES_VERSION: cada turno guarda la versión que se aceptó.

import type { TipoContrato } from "@/lib/reglas-publicacion";

export const CONDICIONES_VERSION = "2026-10-09.2";

const COMUNES = [
  "La información del turno es verdadera y completa: tareas, horario, lugar, pago y condiciones.",
  "Pagaré el monto ofrecido en la forma y el plazo acordados con la persona.",
  "Cumpliré las normas de higiene y seguridad, y entregaré los elementos de protección que el trabajo requiera.",
  "No discriminaré a postulantes ni trabajadores, y usaré sus datos personales solo para este turno.",
];

const CONTRATO_TRABAJO = [
  "Firmaré un contrato de trabajo escrito dentro de los plazos legales.",
  "Pagaré las cotizaciones previsionales, de salud y del seguro de accidentes del trabajo que correspondan.",
  "Respetaré la jornada, los descansos y la remuneración mínima que establece la ley.",
];

const HONORARIOS = [
  "Las respuestas sobre la modalidad describen cómo se hará realmente el trabajo.",
  "La persona prestará el servicio de forma independiente: sin subordinación, sin supervisión directa ni instrucciones continuas.",
  "Si corresponde, retendré y declararé el impuesto de la boleta de honorarios.",
  "Si en la práctica la relación pasa a ser laboral, asumiré todas las obligaciones de empleador.",
];

const CON_INDICIOS =
  "Fui informado de que este turno tiene indicios de relación laboral y de que, si en la práctica hay subordinación " +
  "y dependencia, corresponde un contrato de trabajo.";

export function condicionesPara(contrato: TipoContrato | "", conIndicios = false) {
  if (!contrato) return [];
  if (contrato !== "honorarios") return [...COMUNES, ...CONTRATO_TRABAJO];
  return [...COMUNES, ...HONORARIOS, ...(conIndicios ? [CON_INDICIOS] : [])];
}

export const CIERRE_CONDICIONES =
  "Entiendo que mi empresa es responsable de la relación con la persona que preste el servicio, que estas condiciones " +
  "no reemplazan los derechos que la ley le otorga, y que su incumplimiento puede llevar a la suspensión de mi cuenta.";

// Condición que acepta el trabajador al confirmar un turno. Si cambias el texto, sube la versión.
export const ASISTENCIA_VERSION = "2026-10-09";
export const CONDICION_ASISTENCIA =
  "Me comprometo a presentarme a la hora acordada. Si no puedo asistir, cancelaré el turno desde TurnoExpress antes de " +
  "su inicio. Si no me presento sin haberlo cancelado, mi cuenta se suspenderá automáticamente por al menos 48 horas " +
  "y solo el equipo de TurnoExpress podrá reactivarla, después de revisar lo ocurrido y mi descargo.";
