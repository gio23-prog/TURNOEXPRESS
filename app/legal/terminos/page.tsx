import type { Metadata } from "next";
import Link from "next/link";
import { OPERADOR } from "@/lib/operador";
import { NORMAS } from "@/lib/reglas-publicacion";
import { DocumentoLegal } from "../documento";

export const metadata: Metadata = { title: "Términos y Condiciones · TurnoExpress" };

// BORRADOR: texto propio de TurnoExpress, pendiente de revisión por un abogado antes del lanzamiento.
export default function Terminos() {
  const o = OPERADOR;
  return (
    <DocumentoLegal
      titulo="Términos y Condiciones de Uso"
      otro={{ href: "/legal/privacidad", texto: "Política de Privacidad" }}
      resumen={
        <>
          <p>
            <strong>En resumen:</strong> {o.marca} es un portal donde las empresas publican ofertas de trabajo por horas, por
            día o por servicio, y las personas postulan. Solo difundimos ofertas: no seleccionamos, no contratamos, no
            pagamos remuneraciones ni somos empleadores. Después de postular, la empresa contacta directamente a quien le
            interese. Postular es siempre gratis; las empresas publican gratis su primer mes. Las ofertas engañosas,
            discriminatorias o que piden pagos al postulante se bloquean.
          </p>
        </>
      }
      secciones={[
        {
          id: "quienes-somos", titulo: "Quiénes somos",
          contenido: (
            <>
              <p>
                {o.marca} es operada por {o.razonSocial}, RUT {o.rut}, con domicilio en {o.domicilio} (&ldquo;nosotros&rdquo;).
                Contacto: {o.correoContacto}.
              </p>
              <p>Estos Términos rigen el uso del sitio y la aplicación {o.marca} (la &ldquo;Plataforma&rdquo;).</p>
            </>
          ),
        },
        {
          id: "servicio", titulo: "Qué hace la Plataforma",
          contenido: (
            <>
              <p>La Plataforma permite:</p>
              <ul>
                <li>a empresas y personas con actividad comercial (&ldquo;Empresas&rdquo;), publicar ofertas de trabajo o de servicios y recibir postulaciones con el currículum y los datos de contacto de quienes postulan;</li>
                <li>a personas que buscan trabajo por horas, por día o por servicio (&ldquo;Postulantes&rdquo;), buscar ofertas, postular y ver el estado de sus postulaciones.</li>
              </ul>
              <p>
                {o.marca} es un <strong>portal de difusión de ofertas</strong>. No es agencia de empleo ni empresa de servicios
                transitorios, no es empleador de los Postulantes, no presta los servicios publicados y no suministra personal.
                No participa en la selección, la negociación, la contratación ni el pago. Cada Empresa decide a quién contactar
                y contratar, bajo qué tipo de contrato, y es la única responsable de esa relación y de cumplir la ley laboral,
                previsional y tributaria.
              </p>
              <p>
                Revisamos las ofertas con reglas automáticas para bloquear contenido prohibido, pero no verificamos que cada
                oferta sea exacta ni garantizamos que una Empresa contrate a alguien. Si una oferta te parece sospechosa,
                repórtala.
              </p>
            </>
          ),
        },
        {
          id: "cuentas", titulo: "Cuentas y requisitos",
          contenido: (
            <ul>
              <li>Para usar la Plataforma debes ser mayor de 18 años.</li>
              <li>
                Las Empresas deben estar constituidas legalmente o tener inicio de actividades ante el SII. Quien registra una
                Empresa declara tener facultades para obligarla. Cada RUT de empresa puede tener una sola cuenta.
              </li>
              <li>Los datos que entregues deben ser verdaderos y mantenerse actualizados.</li>
              <li>Tu cuenta y tu contraseña son personales. Avísanos si sospechas un uso no autorizado.</li>
            </ul>
          ),
        },
        {
          id: "publicaciones", titulo: "Normas para publicar ofertas",
          contenido: (
            <>
              <p>Cada oferta debe describir un trabajo o servicio real, con fecha, horario, comuna, tipo de contratación y pago en pesos chilenos. Además:</p>
              <ul>{NORMAS.map((n) => <li key={n}>{n}</li>)}</ul>
              <p>
                Está prohibido publicar ofertas para menores de edad, ofrecer trabajos ilícitos o pedir fotografías, y exigir
                certificaciones que el trabajo no requiera. Los oficios regulados (por ejemplo, instalaciones eléctricas o de gas)
                solo pueden publicarse si exigen la autorización correspondiente.
              </p>
              <p>
                Las preguntas que la Empresa agregue para los postulantes deben referirse solo a la capacidad para realizar el
                trabajo. No se puede preguntar por edad, sexo, situación familiar, embarazo, religión, salud, afiliación
                sindical, opinión política u origen.
              </p>
              <p>
                Las ofertas que no cumplen estas normas se bloquean al publicar, indicando el motivo. Las ofertas con boleta de
                honorarios que tienen indicios de relación laboral se publican y se revisan después.
              </p>
            </>
          ),
        },
        {
          id: "empresas", titulo: "Obligaciones de las Empresas",
          contenido: (
            <>
              <p>Al publicar cada oferta, la Empresa acepta las condiciones del empleador que se muestran en ese momento. En particular, se obliga a:</p>
              <ul>
                <li>elegir el tipo de contratación que corresponde a la forma real en que se hará el trabajo;</li>
                <li>con contrato de trabajo: escriturarlo dentro de los plazos legales, pagar las cotizaciones y respetar jornada, descansos y remuneración mínima;</li>
                <li>con boleta de honorarios: no ejercer subordinación ni dependencia y, cuando corresponda, retener y declarar el impuesto;</li>
                <li>pagar lo acordado, cumplir las normas de higiene y seguridad y entregar los elementos de protección necesarios;</li>
                <li>
                  tratar los datos de contacto y el currículum de los Postulantes como responsable de ese tratamiento, usarlos
                  solo para el proceso de selección de la oferta a la que postularon, no compartirlos con terceros y no
                  formar bases de datos para otros fines;
                </li>
                <li>no cobrar a los Postulantes por postular, por la selección ni por ser contratados.</li>
              </ul>
            </>
          ),
        },
        {
          id: "postulantes", titulo: "Obligaciones de los Postulantes",
          contenido: (
            <ul>
              <li>Entregar información verdadera sobre su identidad, experiencia y disponibilidad, y subir un currículum propio.</li>
              <li>Postular solo a ofertas que le interesen y pueda cumplir.</li>
              <li>
                Entender que, al postular, la Empresa recibe su nombre, teléfono, correo, perfil y currículum para contactarlo.
                Puede retirar la postulación cuando quiera y la Empresa dejará de ver esos datos en la Plataforma.
              </li>
            </ul>
          ),
        },
        {
          id: "despues", titulo: "Después de postular",
          contenido: (
            <>
              <p>
                La Empresa puede marcar cada postulación como vista, preseleccionada o descartada, y el Postulante ve ese estado.
                Todo contacto posterior, entrevistas, acuerdos, contratos y pagos ocurren directamente entre la Empresa y el
                Postulante, fuera de {o.marca}.
              </p>
              <p>
                {o.marca} no registra contrataciones, no controla la asistencia ni el cumplimiento de lo acordado, no emite
                boletas ni facturas a nombre de los usuarios y no interviene en conflictos entre ellos. Para dudas sobre
                derechos laborales, el Postulante puede consultar en la Dirección del Trabajo.
              </p>
              <p>
                La Empresa puede cerrar una oferta en cualquier momento; las postulaciones que seguían abiertas quedan como no
                seleccionadas.
              </p>
            </>
          ),
        },
        {
          id: "moderacion", titulo: "Revisión y moderación",
          contenido: (
            <p>
              Revisamos las publicaciones con reglas automáticas y con personas. Cuando una decisión pueda afectar
              significativamente a un usuario, como la suspensión de una cuenta, interviene una persona del equipo. Puedes
              pedir que revisemos cualquier decisión escribiendo a {o.correoContacto}. Cualquier usuario puede reportar
              publicaciones, mensajes o conductas que incumplan estos Términos.
            </p>
          ),
        },
        {
          id: "precios", titulo: "Precios",
          contenido: (
            <p>
              Buscar ofertas y postular es siempre gratis para los Postulantes. Las Empresas pueden publicar gratis durante
              su primer mes, contado desde que crean su cuenta, dentro de los límites del plan gratuito. Después de ese mes,
              publicar podrá tener un costo: informaremos el precio y las condiciones antes de cobrar, y solo cobraremos si la
              Empresa lo acepta expresamente. Nunca haremos cobros automáticos sin autorización.
            </p>
          ),
        },
        {
          id: "suspension", titulo: "Suspensión y término",
          contenido: (
            <p>
              Puedes cerrar tu cuenta cuando quieras. Podemos suspender o cerrar cuentas que incumplan estos Términos o la ley,
              informando el motivo, salvo que hacerlo ponga en riesgo una investigación o a otras personas. El cierre de una
              cuenta no elimina los registros que debamos conservar por obligación legal.
            </p>
          ),
        },
        {
          id: "responsabilidad", titulo: "Responsabilidad",
          contenido: (
            <>
              <p>
                Cada usuario responde por la información que publica y por el cumplimiento de sus obligaciones con el otro. No
                garantizamos que una oferta reciba postulaciones, que una Empresa contrate, ni el resultado de una
                contratación, ya que no participamos en ella.
              </p>
              <p>
                Nada en estos Términos limita los derechos irrenunciables de los trabajadores ni los derechos que la Ley
                N° 19.496 otorga a los consumidores.
              </p>
            </>
          ),
        },
        {
          id: "propiedad", titulo: "Contenido y propiedad intelectual",
          contenido: (
            <p>
              Lo que publicas sigue siendo tuyo. Nos autorizas a mostrarlo y difundirlo dentro de la Plataforma solo para
              operar el servicio y dar a conocer las ofertas. La marca, el diseño y el software de {o.marca} nos pertenecen.
            </p>
          ),
        },
        {
          id: "cambios", titulo: "Cambios a estos Términos",
          contenido: (
            <p>
              Si cambiamos estos Términos te avisaremos por correo o dentro de la Plataforma antes de que entren en vigor. Si
              un cambio afecta tus derechos, te pediremos aceptarlo nuevamente.
            </p>
          ),
        },
        {
          id: "ley", titulo: "Ley aplicable y tribunales",
          contenido: (
            <p>
              Estos Términos se rigen por las leyes de la República de Chile. Las controversias se someterán a los tribunales
              de Santiago, sin perjuicio del derecho de los consumidores a recurrir al tribunal de su domicilio.
            </p>
          ),
        },
        {
          id: "contacto", titulo: "Contacto",
          contenido: (
            <p>
              Para consultas o reclamos sobre estos Términos escribe a {o.correoContacto}. Para temas de datos personales,
              revisa la <Link href="/legal/privacidad" className="text-teal-800 underline">Política de Privacidad</Link>.
            </p>
          ),
        },
      ]}
    />
  );
}
