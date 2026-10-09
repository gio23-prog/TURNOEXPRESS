import Link from "next/link";

const PASOS = [
  { titulo: "Publica en minutos", texto: "Indica qué necesitas, cuándo y cuánto pagas. El valor por hora se calcula solo." },
  { titulo: "Recibe postulaciones", texto: "Personas disponibles en tu comuna postulan y tú eliges a quién ofrecer el turno." },
  { titulo: "Confirma y evalúa", texto: "Las condiciones quedan registradas y ambas partes se evalúan al terminar." },
];

export default function Inicio() {
  return (
    <main className="flex-1 bg-stone-50">
      <section className="mx-auto max-w-3xl px-6 py-16 text-center sm:py-24">
        <p className="text-sm font-medium uppercase tracking-wide text-teal-800">Región Metropolitana</p>
        <h1 className="mt-3 text-4xl font-semibold text-stone-900 sm:text-5xl">Turnos por horas, cuando los necesitas</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-stone-700">
          Conecta con personas disponibles para gastronomía, eventos, comercio, logística y más. Sin cobro para quien busca trabajo.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/registro" className="rounded-lg bg-teal-700 px-6 py-3 font-medium text-white hover:bg-teal-800">
            Crear cuenta
          </Link>
          <Link href="/ingresar" className="rounded-lg border border-stone-300 bg-white px-6 py-3 font-medium text-stone-800 hover:border-teal-700">
            Ingresar
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-4xl gap-4 px-6 pb-16 sm:grid-cols-3">
        {PASOS.map((p) => (
          <div key={p.titulo} className="rounded-lg border border-stone-200 bg-white p-5">
            <h2 className="font-medium text-stone-900">{p.titulo}</h2>
            <p className="mt-1 text-sm text-stone-600">{p.texto}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-stone-200 px-6 py-6 text-center text-sm text-stone-500">
        TurnoExpress (nombre provisional) · La plataforma conecta a las partes; no es empleadora ni emite documentos tributarios.
      </footer>
    </main>
  );
}
