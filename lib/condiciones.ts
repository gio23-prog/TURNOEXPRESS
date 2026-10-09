// Condiciones que el empleador acepta al publicar cada oferta.
// BORRADOR: debe revisarlo un abogado antes del lanzamiento.
// Si cambias el texto, sube CONDICIONES_VERSION: cada oferta guarda la versión que se aceptó.

import type { TipoContrato } from "@/lib/reglas-publicacion";

export const CONDICIONES_VERSION = "2026-10-09.3";

const COMUNES = [
  "La información de la oferta es verdadera y completa: tareas, horario, lugar, pago y condiciones.",
  "Si contrato a alguien por esta oferta, le pagaré el monto ofrecido en la forma y el plazo acordados.",
  "Cumpliré las normas de higiene y seguridad, y entregaré los elementos de protección que el trabajo requiera.",
  "No discriminaré a los postulantes y usaré sus datos de contacto y currículum solo para el proceso de selección de esta oferta.",
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
  "Fui informado de que esta oferta tiene indicios de relación laboral y de que, si en la práctica hay subordinación " +
  "y dependencia, corresponde un contrato de trabajo.";

export function condicionesPara(contrato: TipoContrato | "", conIndicios = false) {
  if (!contrato) return [];
  if (contrato !== "honorarios") return [...COMUNES, ...CONTRATO_TRABAJO];
  return [...COMUNES, ...HONORARIOS, ...(conIndicios ? [CON_INDICIOS] : [])];
}

export const CIERRE_CONDICIONES =
  "Entiendo que TurnoExpress solo difunde la oferta y no participa en la selección, la contratación ni el pago; que mi empresa es responsable de la relación con la persona que preste el servicio, que estas condiciones " +
  "no reemplazan los derechos que la ley le otorga, y que su incumplimiento puede llevar a la suspensión de mi cuenta.";
