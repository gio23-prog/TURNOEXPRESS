import { redirect } from "next/navigation";

// /empresa no tiene contenido propio: lleva a las ofertas de la empresa.
export default function Empresa() {
  redirect("/empresa/publicaciones");
}
