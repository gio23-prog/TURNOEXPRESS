import type { Metadata } from "next";
import Link from "next/link";
import DocumentoLegal from "@/components/DocumentoLegal";
import { AVISO_MEDIO } from "@/lib/legal";

export const metadata: Metadata = { title: "Aviso legal" };

export default function AvisoLegal() {
  return (
    <DocumentoLegal titulo="Aviso legal">
      <p><strong>{AVISO_MEDIO}</strong></p>
      <h2>Qué hace Turnoexpress</h2>
      <ul>
        <li>Permite que empresas publiquen ofertas de trabajo por horas o por turno.</li>
        <li>Permite que personas busquen esas ofertas y postulen.</li>
        <li>Facilita que la empresa y quien postula se pongan en contacto.</li>
      </ul>
      <h2>Qué no hace Turnoexpress</h2>
      <ul>
        <li>No es el empleador ni actúa en nombre de las empresas que publican.</li>
        <li>No selecciona, contrata ni dirige a ninguna persona.</li>
        <li>No paga remuneraciones ni honorarios, ni emite o administra documentos tributarios por los trabajos publicados.</li>
        <li>No garantiza que una postulación termine en un trabajo, ni la veracidad de cada oferta, aunque revisa y modera los avisos.</li>
      </ul>
      <h2>Responsabilidad de quien publica</h2>
      <p>
        Cada empresa es responsable del contenido de sus ofertas, de cumplir la legislación laboral, tributaria y de no
        discriminación, y de la relación que establezca con las personas que contrate.
      </p>
      <h2>Reportar un aviso</h2>
      <p>
        Si una oferta te parece falsa, discriminatoria o te pide dinero, no entregues datos ni pagos y repórtala. Más detalle en
        los <Link href="/terminos" className="font-medium text-turquesa-oscuro underline">términos de uso</Link>.
      </p>
    </DocumentoLegal>
  );
}
