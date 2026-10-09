import type { Metadata } from "next";
import Link from "next/link";
import { OPERADOR } from "@/lib/operador";
import { DocumentoLegal } from "../documento";

export const metadata: Metadata = { title: "Política de Privacidad · TurnoExpress" };

// BORRADOR: texto propio de TurnoExpress conforme a la Ley N° 19.628 y la Ley N° 21.719.
// Pendiente de revisión por un abogado. Si la plataforma empieza a usar nuevos proveedores,
// analítica o publicidad, esta política debe actualizarse ANTES.
export default function Privacidad() {
  const o = OPERADOR;
  return (
    <DocumentoLegal
      titulo="Política de Privacidad"
      otro={{ href: "/legal/terminos", texto: "Términos y Condiciones" }}
      resumen={
        <p>
          <strong>En resumen:</strong> usamos tus datos solo para que funcione la Plataforma: crear tu cuenta, publicar y
          buscar turnos, postular y gestionar contrataciones. No vendemos tus datos, no mostramos publicidad y no usamos
          cookies de seguimiento. Tu RUT, tu teléfono y la dirección exacta de un turno nunca son públicos. Puedes pedir
          acceder, corregir o eliminar tus datos cuando quieras.
        </p>
      }
      secciones={[
        {
          id: "responsable", titulo: "Responsable",
          contenido: (
            <p>
              El responsable del tratamiento de tus datos es {o.razonSocial}, RUT {o.rut}, con domicilio en {o.domicilio}.
              Para temas de privacidad escribe a {o.correoPrivacidad}.
            </p>
          ),
        },
        {
          id: "datos", titulo: "Qué datos recopilamos",
          contenido: (
            <>
              <p><strong>Si eres Trabajador:</strong></p>
              <ul>
                <li>Cuenta: nombre, correo y contraseña (que guardamos cifrada).</li>
                <li>Perfil: nombre visible, descripción, experiencia, oficios, comunas donde trabajas, disponibilidad, tarifa, si emites boleta de honorarios y, si la subes, una foto.</li>
                <li>Postulaciones: tu mensaje, la experiencia que destaques y tus respuestas a las preguntas de la empresa.</li>
                <li>Contrataciones: condiciones aceptadas, mensajes con la empresa, evaluaciones y los datos de tus boletas (folio, fecha, monto y, si lo adjuntas, el archivo).</li>
              </ul>
              <p><strong>Si eres Empresa:</strong></p>
              <ul>
                <li>Persona a cargo: nombre, cargo, teléfono y correo.</li>
                <li>Empresa: nombre comercial, razón social, RUT, giro, sector, tamaño, dirección fiscal y descripción.</li>
                <li>Representante legal: nombre y RUT.</li>
                <li>Publicaciones, dirección de cada turno, preguntas a postulantes y condiciones aceptadas.</li>
              </ul>
              <p><strong>De todos los usuarios:</strong> registros técnicos de seguridad (fecha, hora, dirección IP y navegador) y los reportes que envíes.</p>
              <p>
                <strong>Ubicación:</strong> solo si la autorizas, para calcular distancias aproximadas en la búsqueda. No la
                guardamos. Siempre puedes buscar por comuna sin compartirla.
              </p>
              <p>
                <strong>No pedimos datos sensibles</strong> (salud, religión, orientación sexual, origen étnico, opinión política
                o afiliación sindical) y no permitimos que las empresas los pregunten.
              </p>
            </>
          ),
        },
        {
          id: "finalidades", titulo: "Para qué los usamos",
          contenido: (
            <ul>
              <li><strong>Prestar el servicio</strong> que aceptaste en los Términos: cuentas, publicaciones, búsqueda, postulaciones, contrataciones, mensajes, evaluaciones y registro de documentos tributarios.</li>
              <li><strong>Seguridad y prevención de fraude:</strong> verificar empresas, detectar publicaciones engañosas o discriminatorias y proteger las cuentas.</li>
              <li><strong>Cumplir obligaciones legales</strong> y responder requerimientos de autoridades.</li>
              <li><strong>Mejorar la Plataforma</strong> con estadísticas agregadas que no te identifican.</li>
              <li><strong>Comunicaciones comerciales:</strong> solo si nos das tu consentimiento, que puedes retirar en cualquier momento.</li>
            </ul>
          ),
        },
        {
          id: "compartir", titulo: "Con quién los compartimos",
          contenido: (
            <>
              <ul>
                <li>
                  <strong>Entre usuarios, solo lo necesario:</strong> cuando postulas, la empresa ve tu perfil, tu mensaje y tus
                  respuestas. Los trabajadores ven el nombre comercial de la empresa, nunca su RUT ni el de su representante. La
                  dirección exacta de un turno solo la ve quien queda contratado.
                </li>
                <li>
                  <strong>Proveedores que nos prestan servicios</strong> (alojamiento, base de datos, autenticación y envío de
                  correos), que tratan los datos por encargo nuestro, con obligaciones de confidencialidad y seguridad. Actualmente:
                  Supabase (base de datos y autenticación) y el proveedor de alojamiento del sitio.
                </li>
                <li><strong>Autoridades</strong>, cuando la ley o una resolución judicial lo exija.</li>
              </ul>
              <p>No vendemos ni arrendamos tus datos.</p>
            </>
          ),
        },
        {
          id: "transferencias", titulo: "Datos fuera de Chile",
          contenido: (
            <p>
              Algunos proveedores almacenan datos en servidores fuera de Chile. En esos casos exigimos medidas de seguridad y
              resguardos contractuales equivalentes a los que exige la ley chilena.
            </p>
          ),
        },
        {
          id: "conservacion", titulo: "Cuánto tiempo los guardamos",
          contenido: (
            <p>
              Mientras tu cuenta esté activa. Si la cierras, eliminamos o anonimizamos tus datos, salvo los registros que
              debamos conservar por obligaciones legales (por ejemplo, tributarias o laborales) o para defendernos de un
              reclamo, y solo por el plazo que corresponda. Las empresas pueden usar los datos de un postulante solo para el
              turno al que postuló.
            </p>
          ),
        },
        {
          id: "derechos", titulo: "Tus derechos",
          contenido: (
            <>
              <p>Puedes pedirnos en cualquier momento:</p>
              <ul>
                <li><strong>Acceso:</strong> saber qué datos tuyos tratamos.</li>
                <li><strong>Rectificación:</strong> corregir datos inexactos (muchos los puedes editar tú mismo en tu perfil).</li>
                <li><strong>Supresión:</strong> eliminar tus datos.</li>
                <li><strong>Oposición:</strong> que dejemos de usarlos para alguna finalidad.</li>
                <li><strong>Portabilidad:</strong> recibir tus datos en un formato que puedas llevar a otro servicio.</li>
                <li><strong>Bloqueo:</strong> que suspendamos temporalmente su uso mientras se resuelve una solicitud.</li>
              </ul>
              <p>
                <strong>Decisiones automatizadas:</strong> usamos reglas automáticas para detectar publicaciones que no cumplen
                las normas. Toda decisión que te afecte significativamente, como suspender tu cuenta, la revisa una persona, y
                puedes pedir su revisión.
              </p>
              <p>
                Para ejercer tus derechos escribe a {o.correoPrivacidad} indicando tu nombre, el correo de tu cuenta y qué
                necesitas. Responderemos dentro del plazo legal. Si no quedas conforme, puedes reclamar ante la Agencia de
                Protección de Datos Personales o los tribunales competentes.
              </p>
            </>
          ),
        },
        {
          id: "seguridad", titulo: "Seguridad",
          contenido: (
            <p>
              Protegemos tus datos con conexiones cifradas, contraseñas cifradas, permisos que limitan quién puede ver cada
              dato y registros de las acciones administrativas. Ningún sistema es infalible: si ocurre una vulneración que
              afecte tus datos, te informaremos a ti y a la autoridad según lo exija la ley.
            </p>
          ),
        },
        {
          id: "cookies", titulo: "Cookies",
          contenido: (
            <p>
              Solo usamos las cookies necesarias para mantener tu sesión iniciada y recordar preferencias básicas. No usamos
              cookies de publicidad ni de seguimiento de terceros. Si en el futuro las incorporamos, te pediremos tu
              consentimiento antes.
            </p>
          ),
        },
        {
          id: "menores", titulo: "Menores de edad",
          contenido: (
            <p>
              La Plataforma es solo para mayores de 18 años. Si detectamos una cuenta de un menor, la eliminaremos junto con sus
              datos.
            </p>
          ),
        },
        {
          id: "cambios", titulo: "Cambios a esta política",
          contenido: (
            <p>
              Si cambiamos esta política te avisaremos por correo o dentro de la Plataforma antes de que el cambio se aplique.
              Si el cambio requiere tu consentimiento, te lo pediremos.
            </p>
          ),
        },
        {
          id: "contacto", titulo: "Contacto",
          contenido: (
            <p>
              Privacidad: {o.correoPrivacidad}. Otras consultas: {o.correoContacto}. Revisa también los{" "}
              <Link href="/legal/terminos" className="text-teal-800 underline">Términos y Condiciones</Link>.
            </p>
          ),
        },
      ]}
    />
  );
}
