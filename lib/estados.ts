// Estados de una postulación tal como los ve cada persona. Los valores vienen de application_status en la base.

export type EstadoPostulacion =
  | "pendiente" | "en_revision" | "preseleccionada" | "oferta_enviada"
  | "aceptada" | "rechazada" | "retirada" | "finalizada" | "incidencia_reportada";

/** Camino normal de una postulación. El índice es el avance (0 a 5). */
export const PASOS = [
  { estado: "pendiente", trabajador: "Postulado", empresa: "Nuevo", ayuda: "Tu postulación llegó a la empresa." },
  { estado: "en_revision", trabajador: "Perfil visto", empresa: "Visto", ayuda: "La empresa revisó tu perfil." },
  { estado: "preseleccionada", trabajador: "Preseleccionado", empresa: "Preseleccionado", ayuda: "Estás entre los candidatos favoritos." },
  { estado: "oferta_enviada", trabajador: "Oferta recibida", empresa: "Oferta enviada", ayuda: "Revisa las condiciones y responde la oferta." },
  { estado: "aceptada", trabajador: "Turno confirmado", empresa: "Confirmado", ayuda: "El turno es tuyo. Ya puedes ver la dirección." },
  { estado: "finalizada", trabajador: "Finalizado", empresa: "Finalizado", ayuda: "El servicio terminó. Ya puedes evaluar." },
] as const;

const TERMINALES: Record<string, { trabajador: string; empresa: string }> = {
  rechazada: { trabajador: "No seleccionado", empresa: "Descartado" },
  retirada: { trabajador: "Retiraste la postulación", empresa: "Retirada por el postulante" },
  incidencia_reportada: { trabajador: "Incidencia reportada", empresa: "Incidencia reportada" },
};

export function nombreEstado(estado: string, para: "trabajador" | "empresa") {
  return PASOS.find((p) => p.estado === estado)?.[para] ?? TERMINALES[estado]?.[para] ?? estado;
}

/** Avance de 0 a 5 en el camino normal, o -1 si la postulación terminó fuera de él. */
export const avance = (estado: string) => PASOS.findIndex((p) => p.estado === estado);

export type Tono = "nuevo" | "proceso" | "accion" | "exito" | "cerrado";

export function tonoEstado(estado: string): Tono {
  if (estado === "pendiente") return "nuevo";
  if (estado === "oferta_enviada") return "accion";
  if (estado === "aceptada" || estado === "finalizada") return "exito";
  if (estado === "en_revision" || estado === "preseleccionada") return "proceso";
  return "cerrado";
}

/** Pestañas de "Mis postulaciones" (trabajador). */
export const GRUPOS_TRABAJADOR = [
  { id: "todas", nombre: "Todas", estados: null },
  { id: "proceso", nombre: "En proceso", estados: ["pendiente", "en_revision", "preseleccionada", "oferta_enviada"] },
  { id: "confirmadas", nombre: "Confirmadas", estados: ["aceptada"] },
  { id: "finalizadas", nombre: "Finalizadas", estados: ["finalizada"] },
  { id: "cerradas", nombre: "No seleccionadas", estados: ["rechazada", "retirada", "incidencia_reportada"] },
] as const;

/** Pestañas de postulantes (empresa). */
export const GRUPOS_EMPRESA = [
  { id: "todos", nombre: "Todos", estados: null },
  { id: "nuevos", nombre: "Nuevos", estados: ["pendiente", "en_revision"] },
  { id: "preseleccionados", nombre: "Preseleccionados", estados: ["preseleccionada"] },
  { id: "ofertas", nombre: "Con oferta", estados: ["oferta_enviada"] },
  { id: "confirmados", nombre: "Confirmados", estados: ["aceptada", "finalizada"] },
  { id: "descartados", nombre: "Descartados", estados: ["rechazada", "retirada"] },
] as const;

export const ESTADO_PUBLICACION: Record<string, string> = {
  borrador: "Borrador",
  publicada: "Publicado",
  en_revision: "En revisión",
  con_postulaciones: "Con postulaciones",
  cubierta: "Cubierto",
  en_curso: "En curso",
  finalizada: "Finalizado",
  cancelada: "Cancelado",
  vencida: "Vencido",
};
