"use client";

import { useState } from "react";
import type { EmpresaInput } from "@/lib/schemas/empresa";
import FormularioEmpresa from "@/app/empresa/perfil/formulario";
import FormularioTrabajador from "./trabajador";

type Opcion = { id: number; nombre: string };

const EMPRESA_VACIA: EmpresaInput = {
  nombreComercial: "", razonSocial: "", rutEmpresa: "", giro: "", rubro: "", sector: "", tamano: "", turnosMes: "",
  descripcion: "", region: "", comuna: "", direccionFiscal: "", repNombre: "", repRut: "",
  contactoNombre: "", contactoCargo: "", contactoTelefono: "", contactoCorreo: "",
};

const TIPOS = [
  { id: "trabajador", titulo: "Busco turnos", texto: "Quiero encontrar turnos por horas, por día o de fin de semana y postular." },
  { id: "empresa", titulo: "Necesito personal", texto: "Quiero publicar turnos y recibir postulaciones." },
] as const;

export default function Registro({ regiones, comunas }: { regiones: Opcion[]; comunas: (Opcion & { regionId: number })[] }) {
  const [tipo, setTipo] = useState<"trabajador" | "empresa" | null>(null);

  return (
    <main className={`mx-auto p-6 ${tipo ? "max-w-3xl" : "max-w-md"}`}>
      <h1 className="text-2xl font-semibold text-stone-900">
        {tipo === "empresa" ? "Crea la cuenta de tu empresa" : tipo === "trabajador" ? "Crea tu cuenta para postular a turnos" : "Crear cuenta"}
      </h1>

      {!tipo ? (
        <section className="mt-6 space-y-3">
          <p className="text-sm text-stone-600">¿Qué quieres hacer?</p>
          {TIPOS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTipo(t.id)}
              className="w-full rounded-lg border border-stone-300 bg-white p-4 text-left hover:border-teal-700">
              <span className="block font-medium text-stone-900">{t.titulo}</span>
              <span className="block text-sm text-stone-600">{t.texto}</span>
            </button>
          ))}
        </section>
      ) : (
        <div className="mt-2 space-y-4">
          <p className="text-stone-600">
            {tipo === "empresa"
              ? "Completa los datos una sola vez y podrás publicar tu primer turno de inmediato."
              : "Paso 1 de 3: tus datos. Después subirás tu CV y completarás tu perfil."}
          </p>
          <button type="button" onClick={() => setTipo(null)} className="text-sm text-stone-600 underline">
            Cambiar tipo de cuenta
          </button>
          {tipo === "empresa" ? (
            <FormularioEmpresa modo="registro" inicial={EMPRESA_VACIA} regiones={regiones} comunas={comunas} />
          ) : (
            <FormularioTrabajador regiones={regiones} comunas={comunas} />
          )}
        </div>
      )}
    </main>
  );
}
