// Estados de una postulación tal como los ve cada persona. Los valores vienen de application_status en la base.
// TurnoExpress solo difunde ofertas: después de la preselección, la empresa contacta directamente al postulante.

export type EstadoPostulacion = "pendiente" | "en_revision" | "preseleccionada" | "rechazada" | "retirada";

/** Camino normal de una postulación. El índice es el avance (0 a 2). */
export const PASOS = [
  { estado: "pendiente", trabajador: "Postulado", empresa: "Nuevo", ayuda: "Tu postulación y tu currículum llegaron a la empresa." },
  { estado: "en_revision", trabajador: "CV visto", empresa: "Visto", ayuda: "La empresa revisó tu postulación." },
  { estado: "preseleccionada", trabajador: "Preseleccionado", empresa: "Preseleccionado",
    ayuda: "Estás entre los candidatos favoritos. La empresa podría contactarte por teléfono o correo." },
] as const;

const TERMINALES: Record<string, { trabajador: string; empresa: string }> = {
  rechazada: { trabajador: "No seleccionado", empresa: "Descartado" },
  retirada: { trabajador: "Retiraste la postulación", empresa: "Retirada por el postulante" },
};

export function nombreEstado(estado: string, para: "trabajador" | "empresa") {
  return PASOS.find((p) => p.estado === estado)?.[para] ?? TERMINALES[estado]?.[para] ?? estado;
}

/** Avance en el camino normal, o -1 si la postulación terminó fuera de él. */
export const avance = (estado: string) => PASOS.findIndex((p) => p.estado === estado);

export type Tono = "nuevo" | "proceso" | "exito" | "cerrado";

export function tonoEstado(estado: string): Tono {
  if (estado === "pendiente") return "nuevo";
  if (estado === "en_revision") return "proceso";
  if (estado === "preseleccionada") return "exito";
  return "cerrado";
}

/** Pestañas de "Mis postulaciones" (trabajador). */
export const GRUPOS_TRABAJADOR = [
  { id: "todas", nombre: "Todas", estados: null },
  { id: "proceso", nombre: "En proceso", estados: ["pendiente", "en_revision"] },
  { id: "preseleccionadas", nombre: "Preseleccionadas", estados: ["preseleccionada"] },
  { id: "cerradas", nombre: "Cerradas", estados: ["rechazada", "retirada"] },
] as const;

/** Pestañas de postulantes (empresa). */
export const GRUPOS_EMPRESA = [
  { id: "todos", nombre: "Todos", estados: ["pendiente", "en_revision", "preseleccionada", "rechazada"] },
  { id: "nuevos", nombre: "Por revisar", estados: ["pendiente", "en_revision"] },
  { id: "preseleccionados", nombre: "Preseleccionados", estados: ["preseleccionada"] },
  { id: "descartados", nombre: "Descartados", estados: ["rechazada"] },
] as const;

export const ESTADO_PUBLICACION: Record<string, string> = {
  borrador: "Borrador",
  publicada: "Publicada",
  en_revision: "En revisión",
  con_postulaciones: "Con postulaciones",
  cancelada: "Cerrada",
  vencida: "Vencida",
};
