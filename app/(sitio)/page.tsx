import Link from "next/link";

const PASOS = [
  { titulo: "Publica en minutos", texto: "Indica qué necesitas, cuándo y cuánto pagas. El valor por hora se calcula solo." },
  { titulo: "Recibe postulaciones", texto: "Personas disponibles en tu comuna postulan con su perfil." },
  { titulo: "Conversa y decide", texto: "Contacta a quien te interese y acuerden directamente las condiciones del turno." },
];

export default function Inicio() {
  return (
    <main className="flex-1 bg-fondo">
      <section className="mx-auto max-w-3xl px-6 py-16 text-center sm:py-24">
        <p className="text-sm font-medium uppercase tracking-wide text-turquesa-oscuro">Trabajo temporal, oportunidades reales</p>
        <h1 className="mt-3 text-4xl font-semibold text-marino sm:text-5xl">Turnos por horas, cuando los necesitas</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-texto-suave">
          Conecta con personas disponibles para gastronomía, eventos, comercio, logística y más. Sin cobro para quien busca trabajo.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/registro" className="rounded-lg bg-turquesa-oscuro px-6 py-3 font-medium text-white hover:bg-turquesa-hover">
            Crear cuenta
          </Link>
          <Link href="/ingresar" className="rounded-lg border border-borde-fuerte bg-white px-6 py-3 font-medium text-marino hover:border-turquesa">
            Ingresar
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-4xl gap-4 px-6 pb-16 sm:grid-cols-3">
        {PASOS.map((p) => (
          <div key={p.titulo} className="rounded-lg border border-borde bg-fondo-suave p-5">
            <h2 className="font-medium text-marino">{p.titulo}</h2>
            <p className="mt-1 text-sm text-texto-suave">{p.texto}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
