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
            <strong>En resumen:</strong> {o.marca} conecta a negocios que necesitan cubrir turnos o servicios puntuales con
            personas que los realizan. No somos el empleador de nadie: la relación de trabajo o de servicio es entre la empresa
            y la persona, y ambas deben cumplir la ley chilena. Postular es gratis. Las publicaciones engañosas,
            discriminatorias o que piden pagos al trabajador se bloquean.
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
                <li>a empresas y personas con actividad comercial (&ldquo;Empresas&rdquo;), publicar turnos y servicios puntuales y elegir entre quienes postulan;</li>
                <li>a personas que buscan trabajo por horas, por día o por servicio (&ldquo;Trabajadores&rdquo;), buscar turnos, postular y gestionar sus contrataciones;</li>
                <li>a ambos, registrar las condiciones acordadas, la finalización del servicio, sus evaluaciones y los documentos tributarios emitidos.</li>
              </ul>
              <p>
                {o.marca} es una herramienta de intermediación. <strong>No es empleador</strong> de los Trabajadores, no presta
                los servicios publicados y no suministra personal a las Empresas. Cada Empresa decide a quién contratar y bajo
                qué tipo de contrato, y es responsable de esa relación.
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
          id: "publicaciones", titulo: "Normas para publicar turnos",
          contenido: (
            <>
              <p>Cada publicación debe describir un turno real, con fecha, horario, lugar, tipo de contratación y pago en pesos chilenos. Además:</p>
              <ul>{NORMAS.map((n) => <li key={n}>{n}</li>)}</ul>
              <p>
                Está prohibido publicar turnos para menores de edad, ofrecer trabajos ilícitos o pedir fotografías, y exigir
                certificaciones que el trabajo no requiera. Los oficios regulados (por ejemplo, instalaciones eléctricas o de gas)
                solo pueden publicarse si exigen la autorización correspondiente.
              </p>
              <p>
                Las preguntas que la Empresa agregue para los postulantes deben referirse solo a la capacidad para realizar el
                trabajo. No se puede preguntar por edad, sexo, situación familiar, embarazo, religión, salud, afiliación
                sindical, opinión política u origen.
              </p>
              <p>
                Las publicaciones que no cumplen estas normas se bloquean al publicar, indicando el motivo. Algunas, como las de
                pago inusualmente alto, se revisan antes de mostrarse.
              </p>
            </>
          ),
        },
        {
          id: "empresas", titulo: "Obligaciones de las Empresas",
          contenido: (
            <>
              <p>Al publicar cada turno, la Empresa acepta las condiciones del empleador que se muestran en ese momento. En particular, se obliga a:</p>
              <ul>
                <li>elegir el tipo de contratación que corresponde a la forma real en que se hará el trabajo;</li>
                <li>con contrato de trabajo: escriturarlo dentro de los plazos legales, pagar las cotizaciones y respetar jornada, descansos y remuneración mínima;</li>
                <li>con boleta de honorarios: no ejercer subordinación ni dependencia y, cuando corresponda, retener y declarar el impuesto;</li>
                <li>pagar lo acordado, cumplir las normas de higiene y seguridad y entregar los elementos de protección necesarios;</li>
                <li>usar los datos de los postulantes solo para gestionar el turno al que postularon, sin compartirlos ni formar bases de datos propias;</li>
                <li>no derivar a los postulantes a otros canales para evitar la Plataforma.</li>
              </ul>
            </>
          ),
        },
        {
          id: "trabajadores", titulo: "Obligaciones de los Trabajadores",
          contenido: (
            <ul>
              <li>Entregar información verdadera sobre su experiencia y disponibilidad.</li>
              <li>Postular solo a turnos que pueda cumplir y avisar con anticipación si debe cancelar.</li>
              <li>Emitir el documento tributario que corresponda cuando el servicio sea a honorarios.</li>
            </ul>
          ),
        },
        {
          id: "contratacion", titulo: "Contratación, cancelaciones y evaluaciones",
          contenido: (
            <>
              <p>
                Un turno queda confirmado cuando la Empresa envía una oferta y el Trabajador la acepta. Las condiciones
                aceptadas quedan registradas y cualquier cambio de horario o pago requiere la aprobación de ambos.
              </p>
              <p>
                Las cancelaciones quedan registradas con su autor, fecha y motivo. Las cancelaciones reiteradas o sin aviso
                pueden llevar a la suspensión de la cuenta.
              </p>
              <p>
                Solo se puede evaluar un servicio finalizado. Las evaluaciones deben ser honestas y respetuosas; está prohibido
                ofrecer o pedir beneficios a cambio de ellas. Podemos ocultar evaluaciones ofensivas o fraudulentas.
              </p>
            </>
          ),
        },
        {
          id: "tributario", titulo: "Documentos tributarios",
          contenido: (
            <p>
              {o.marca} no emite boletas ni facturas a nombre de los usuarios. Solo permite registrar los datos de documentos
              emitidos por el usuario en el Servicio de Impuestos Internos. Cada usuario es responsable de sus obligaciones
              tributarias.
            </p>
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
              Buscar y postular a turnos es gratis para los Trabajadores. Las Empresas pueden publicar gratis dentro de los
              límites del plan gratuito. Si en el futuro ofrecemos servicios pagados, informaremos sus precios antes de
              contratarlos y nunca haremos cobros sin autorización.
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
                garantizamos que un turno sea cubierto ni el resultado de una contratación.
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
              operar el servicio y dar a conocer los turnos. La marca, el diseño y el software de {o.marca} nos pertenecen.
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
