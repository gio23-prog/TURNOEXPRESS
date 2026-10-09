import { redirect } from "next/navigation";

// /trabajador no tiene contenido propio: lleva a las postulaciones.
export default function Trabajador() {
  redirect("/trabajador/postulaciones");
}
