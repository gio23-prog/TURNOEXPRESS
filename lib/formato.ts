const ZONA = "America/Santiago";

export const clp = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

const dia = new Intl.DateTimeFormat("es-CL", { timeZone: ZONA, weekday: "short", day: "numeric", month: "short" });
const hora = new Intl.DateTimeFormat("es-CL", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "sáb, 10 oct · 09:00–17:00" en hora de Chile. */
export function horario(inicio: string, termino: string): string {
  return `${dia.format(new Date(inicio))} · ${hora.format(new Date(inicio))}–${hora.format(new Date(termino))}`;
}

export function duracion(minutos: number): string {
  const h = Math.floor(minutos / 60), m = minutos % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Textos de public.application_status. */
export const ESTADO_POSTULACION: Record<string, string> = {
  pendiente: "Pendiente",
  en_revision: "En revisión",
  preseleccionada: "Preseleccionada",
  oferta_enviada: "La empresa quiere contactarte",
  aceptada: "En contacto",
  rechazada: "No seleccionada",
  retirada: "Retirada",
  finalizada: "Finalizada",
  incidencia_reportada: "Incidencia reportada",
};

/** Estados en los que withdraw_application() permite retirar. */
export const ESTADOS_RETIRABLES = ["pendiente", "en_revision", "preseleccionada", "oferta_enviada"];
