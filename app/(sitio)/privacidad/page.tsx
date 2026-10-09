import type { Metadata } from "next";
import DocumentoLegal from "@/components/DocumentoLegal";

export const metadata: Metadata = { title: "Política de privacidad" };

export default function Privacidad() {
  return (
    <DocumentoLegal titulo="Política de privacidad">
      <h2>1. Responsable</h2>
      <p>Turnoexpress. Razón social, RUT, domicilio y correo de contacto: pendientes de publicar.</p>

      <h2>2. Qué datos tratamos</h2>
      <ul>
        <li><strong>Cuenta:</strong> nombre, correo, tipo de cuenta, fecha de aceptación de estos documentos y declaración de mayoría de edad.</li>
        <li><strong>Perfil:</strong> la información que decidas agregar (por ejemplo, experiencia o comunas donde trabajas).</li>
        <li><strong>Postulaciones y publicaciones:</strong> ofertas que publicas o a las que postulas, mensajes y estados.</li>
        <li><strong>Documentos</strong> (cuando esté disponible): solo los que subas y decidas compartir en cada postulación.</li>
        <li><strong>Datos técnicos:</strong> registros de seguridad necesarios para operar y proteger el servicio.</li>
      </ul>
      <p>No usamos tu ubicación exacta: la distancia se calcula de forma aproximada por comuna.</p>

      <h2>3. Para qué los usamos</h2>
      <ul>
        <li>Crear y mantener tu cuenta.</li>
        <li>Publicar ofertas y permitir postular a ellas.</li>
        <li>Mostrar a la empresa la información de tus postulaciones y facilitar el contacto.</li>
        <li>Prevenir fraudes, abusos y ofertas discriminatorias, y moderar el contenido.</li>
        <li>Cumplir obligaciones legales.</li>
      </ul>
      <p>No vendemos tus datos. No los usamos para decidir automáticamente sobre tus postulaciones.</p>

      <h2>4. Con quién se comparten</h2>
      <ul>
        <li><strong>Empresas:</strong> solo la información de las postulaciones que envías a sus ofertas.</li>
        <li><strong>Proveedores tecnológicos</strong> que alojan y operan el servicio, bajo obligación de confidencialidad. Su lista y país de alojamiento: pendientes de publicar.</li>
        <li><strong>Autoridades</strong>, cuando la ley lo exija.</li>
      </ul>

      <h2>5. Cuánto tiempo los conservamos</h2>
      <p>
        Mientras tu cuenta esté activa y luego por el tiempo necesario para fines legales. Los plazos por tipo de dato se
        publicarán junto con la función de documentos.
      </p>

      <h2>6. Tus derechos</h2>
      <p>
        Puedes pedir acceso a tus datos, su rectificación, su eliminación, oponerte a su tratamiento y, cuando corresponda, su
        portabilidad. También puedes retirar tu consentimiento. Mientras habilitamos estas opciones dentro de la cuenta, el
        canal de contacto se publicará en esta página.
      </p>

      <h2>7. Seguridad</h2>
      <p>
        Aplicamos controles de acceso por usuario, almacenamiento privado de archivos y registro de accesos a información
        sensible. Si ocurre un incidente que afecte tus datos, te informaremos según lo exija la ley.
      </p>

      <h2>8. Menores de edad</h2>
      <p>El servicio es solo para mayores de 18 años.</p>

      <h2>9. Normativa</h2>
      <p>
        Este tratamiento se rige por la legislación chilena de protección de datos personales: hoy la Ley N° 19.628 y, desde su
        entrada en vigencia, la Ley N° 21.719.
      </p>
    </DocumentoLegal>
  );
}
