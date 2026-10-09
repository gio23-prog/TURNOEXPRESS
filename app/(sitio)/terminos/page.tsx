import type { Metadata } from "next";
import Link from "next/link";
import DocumentoLegal from "@/components/DocumentoLegal";

export const metadata: Metadata = { title: "Términos de uso" };

const enlace = "font-medium text-turquesa-oscuro underline";

export default function Terminos() {
  return (
    <DocumentoLegal titulo="Términos de uso">
      <h2>1. Qué es Turnoexpress</h2>
      <p>
        Turnoexpress es un <strong>medio de difusión</strong> de ofertas de trabajo temporal: las empresas publican avisos y las
        personas postulan. Turnoexpress no es empleador, no contrata, no paga remuneraciones ni garantiza empleo. La relación
        laboral o de prestación de servicios, si existe, se establece directamente entre la empresa y la persona.
      </p>

      <h2>2. Cuentas</h2>
      <ul>
        <li>Debes ser mayor de 18 años y entregar información verdadera.</li>
        <li>Hay dos tipos de cuenta: trabajador (busca y postula) y empresa (publica ofertas).</li>
        <li>Eres responsable de mantener tu contraseña en reserva y de la actividad de tu cuenta.</li>
      </ul>

      <h2>3. Uso para trabajadores</h2>
      <ul>
        <li>Buscar ofertas y postular es gratuito.</li>
        <li>Al postular, la empresa ve tu nombre y lo que incluyas en la postulación. Solo verá documentos que decidas compartir.</li>
        <li>Nadie puede cobrarte por postular. Si una oferta te pide dinero, repórtala.</li>
      </ul>

      <h2>4. Uso para empresas</h2>
      <ul>
        <li>Publicas bajo tu exclusiva responsabilidad, con información veraz sobre el trabajo, el horario y el pago.</li>
        <li>
          No puedes exigir requisitos discriminatorios —por ejemplo edad, sexo, nacionalidad, estado civil o apariencia— salvo
          que sean necesarios para el cargo.
        </li>
        <li>
          Solo puedes pedir documentos pertinentes al cargo. El certificado de antecedentes solo procede cuando sea indispensable
          para el cargo y con una justificación visible.
        </li>
        <li>Debes cumplir la legislación laboral y tributaria en la relación que establezcas con quien contrates.</li>
        <li>Turnoexpress puede revisar, pausar o retirar avisos que incumplan estos términos.</li>
      </ul>

      <h2>5. Contenido prohibido</h2>
      <ul>
        <li>Ofertas falsas, engañosas o que pidan pagos, datos bancarios o claves.</li>
        <li>Contenido discriminatorio, ofensivo o ilegal.</li>
        <li>Uso de datos de otras personas para fines distintos de la postulación.</li>
      </ul>

      <h2>6. Planes de pago</h2>
      <p>
        Hoy publicar no tiene costo. Si en el futuro se ofrecen planes de pago para empresas, sus condiciones, precio, forma de
        cobro y de término se informarán antes de contratarlos.
      </p>

      <h2>7. Limitación de responsabilidad</h2>
      <p>
        Turnoexpress no participa en la relación entre empresas y personas, por lo que no responde por el cumplimiento de lo que
        acuerden, sin perjuicio de los derechos que la ley reconoce a las personas usuarias.
      </p>

      <h2>8. Datos personales</h2>
      <p>
        El tratamiento de tus datos se explica en la <Link href="/privacidad" className={enlace}>política de privacidad</Link>.
      </p>

      <h2>9. Cambios y término</h2>
      <p>
        Podemos actualizar estos términos y te avisaremos antes de que un cambio relevante entre en vigencia. Puedes cerrar tu
        cuenta cuando quieras.
      </p>

      <h2>10. Ley aplicable y contacto</h2>
      <p>Estos términos se rigen por las leyes de Chile. Datos de contacto y del responsable: pendientes de publicar.</p>
    </DocumentoLegal>
  );
}
