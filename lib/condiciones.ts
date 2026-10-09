// Condiciones que el empleador acepta al publicar cada turno.
// BORRADOR: debe revisarlo un abogado antes del lanzamiento.
// Si cambias el texto, sube CONDICIONES_VERSION: cada turno guarda la versión que se aceptó.

import type { TipoContrato } from "@/lib/reglas-publicacion";

export const CONDICIONES_VERSION = "2026-10-09";

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
  "La persona prestará el servicio de forma independiente: sin subordinación, sin supervisión directa ni instrucciones continuas.",
  "Si corresponde, retendré y declararé el impuesto de la boleta de honorarios.",
  "Si en la práctica la relación pasa a ser laboral, asumiré todas las obligaciones de empleador.",
];

export function condicionesPara(contrato: TipoContrato | "") {
  if (!contrato) return [];
  return [...COMUNES, ...(contrato === "honorarios" ? HONORARIOS : CONTRATO_TRABAJO)];
}

export const CIERRE_CONDICIONES =
  "Entiendo que mi empresa es responsable de la relación con la persona que preste el servicio, que estas condiciones " +
  "no reemplazan los derechos que la ley le otorga, y que su incumplimiento puede llevar a la suspensión de mi cuenta.";
