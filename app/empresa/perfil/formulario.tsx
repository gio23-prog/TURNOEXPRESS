"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { erroresEmpresa, type EmpresaInput } from "@/lib/schemas/empresa";
import { formatearRut, limpiarRut, rutValido } from "@/lib/rut";
import { guardarEmpresa } from "./actions";

type Opcion = { id: number; nombre: string };

const campo = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700";

function Campo({ id, label, ayuda, error, children }: { id: string; label: string; ayuda?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-stone-700">{label}</label>
      {children}
      {ayuda && !error && <p className="mt-1 text-xs text-stone-500">{ayuda}</p>}
      {error && <p role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}

function Seccion({ titulo, descripcion, children }: { titulo: string; descripcion: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5">
      <h2 className="text-lg font-bold">{titulo}</h2>
      <p className="mt-0.5 text-sm text-stone-600">{descripcion}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export default function FormularioEmpresa({
  inicial, regiones, comunas, completar, destino,
}: {
  inicial: EmpresaInput;
  regiones: Opcion[];
  comunas: (Opcion & { regionId: number })[];
  completar: boolean;
  destino: string | null;
}) {
  const router = useRouter();
  const [d, setD] = useState<EmpresaInput>(inicial);
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const set = (k: keyof EmpresaInput, v: string) => setD((p) => ({ ...p, [k]: v }));
  const comunasRegion = comunas.filter((c) => String(c.regionId) === d.region);

  // Formatea el RUT al salir del campo y avisa en el momento si el dígito verificador no calza.
  const alSalirRut = (k: "rutEmpresa" | "repRut") => {
    const v = d[k];
    if (!limpiarRut(v)) return;
    set(k, formatearRut(v));
    setErr((e) => ({ ...e, [k]: rutValido(v) ? "" : "RUT inválido. Revisa el dígito verificador" }));
  };

  function enviar(e: FormEvent) {
    e.preventDefault();
    const errores = erroresEmpresa(d);
    setErr(errores);
    if (Object.keys(errores).length) {
      setMsg({ ok: false, texto: "Revisa los campos marcados." });
      document.getElementById(Object.keys(errores)[0])?.focus();
      return;
    }
    iniciar(async () => {
      const r = await guardarEmpresa(d);
      setErr(r.errores ?? {});
      setMsg({ ok: r.ok, texto: r.mensaje });
      if (r.ok && destino) router.push(destino);
    });
  }

  return (
    <form onSubmit={enviar} noValidate className="space-y-5">
      {completar && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Antes de publicar turnos necesitamos los datos de tu empresa. Solo los usa TurnoExpress para verificar el negocio;
          los trabajadores únicamente ven el nombre comercial.
        </p>
      )}

      <Seccion titulo="Empresa" descripcion="Tal como está registrada en el Servicio de Impuestos Internos.">
        <Campo id="nombreComercial" label="Nombre comercial" ayuda="Es el que verán los trabajadores." error={err.nombreComercial}>
          <input id="nombreComercial" className={campo} value={d.nombreComercial} onChange={(e) => set("nombreComercial", e.target.value)} />
        </Campo>
        <Campo id="razonSocial" label="Razón social" error={err.razonSocial}>
          <input id="razonSocial" className={campo} value={d.razonSocial} onChange={(e) => set("razonSocial", e.target.value)} placeholder="Ej: Inversiones Gastronómicas SpA" />
        </Campo>
        <Campo id="rutEmpresa" label="RUT de la empresa" error={err.rutEmpresa}>
          <input id="rutEmpresa" className={campo} inputMode="text" autoComplete="off" value={d.rutEmpresa}
            onChange={(e) => set("rutEmpresa", e.target.value)} onBlur={() => alSalirRut("rutEmpresa")} placeholder="76.123.456-7" />
        </Campo>
        <Campo id="giro" label="Giro" ayuda="La actividad económica registrada en el SII." error={err.giro}>
          <input id="giro" className={campo} value={d.giro} onChange={(e) => set("giro", e.target.value)} placeholder="Ej: Restaurantes" />
        </Campo>
        <Campo id="rubro" label="Tipo de negocio (opcional)" error={err.rubro}>
          <input id="rubro" className={campo} value={d.rubro} onChange={(e) => set("rubro", e.target.value)} placeholder="Ej: Restaurante, hotel, bodega" />
        </Campo>
        <div className="sm:col-span-2">
          <Campo id="descripcion" label="Descripción (opcional)" ayuda="Cuéntale a los trabajadores cómo es trabajar con ustedes." error={err.descripcion}>
            <textarea id="descripcion" rows={3} maxLength={1500} className={campo} value={d.descripcion} onChange={(e) => set("descripcion", e.target.value)} />
          </Campo>
        </div>
      </Seccion>

      <Seccion titulo="Dirección fiscal" descripcion="La dirección registrada en el SII. No se muestra a los trabajadores.">
        <Campo id="region" label="Región" error={err.region}>
          <select id="region" className={campo} value={d.region} onChange={(e) => setD((p) => ({ ...p, region: e.target.value, comuna: "" }))}>
            <option value="">Elige una región</option>
            {regiones.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        </Campo>
        <Campo id="comuna" label="Comuna" error={err.comuna}>
          <select id="comuna" className={campo} value={d.comuna} disabled={!d.region} onChange={(e) => set("comuna", e.target.value)}>
            <option value="">{d.region ? "Elige una comuna" : "Primero elige una región"}</option>
            {comunasRegion.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
        <div className="sm:col-span-2">
          <Campo id="direccionFiscal" label="Calle, número y oficina" error={err.direccionFiscal}>
            <input id="direccionFiscal" className={campo} value={d.direccionFiscal} onChange={(e) => set("direccionFiscal", e.target.value)} placeholder="Ej: Av. Providencia 1234, of. 501" />
          </Campo>
        </div>
      </Seccion>

      <Seccion titulo="Representante legal" descripcion="La persona que representa legalmente a la empresa.">
        <Campo id="repNombre" label="Nombre completo" error={err.repNombre}>
          <input id="repNombre" className={campo} autoComplete="off" value={d.repNombre} onChange={(e) => set("repNombre", e.target.value)} />
        </Campo>
        <Campo id="repRut" label="RUT" error={err.repRut}>
          <input id="repRut" className={campo} autoComplete="off" value={d.repRut}
            onChange={(e) => set("repRut", e.target.value)} onBlur={() => alSalirRut("repRut")} placeholder="12.345.678-9" />
        </Campo>
      </Seccion>

      <Seccion titulo="Persona a cargo" descripcion="Quien coordina los turnos. Recibirá los avisos y es el contacto para soporte.">
        <Campo id="contactoNombre" label="Nombre completo" error={err.contactoNombre}>
          <input id="contactoNombre" className={campo} autoComplete="name" value={d.contactoNombre} onChange={(e) => set("contactoNombre", e.target.value)} />
        </Campo>
        <Campo id="contactoCargo" label="Cargo" error={err.contactoCargo}>
          <input id="contactoCargo" className={campo} value={d.contactoCargo} onChange={(e) => set("contactoCargo", e.target.value)} placeholder="Ej: Administrador del local" />
        </Campo>
        <Campo id="contactoTelefono" label="Teléfono" error={err.contactoTelefono}>
          <div className="flex">
            <span className="flex items-center rounded-l-lg border border-r-0 border-stone-300 bg-stone-100 px-3 text-stone-600">+56</span>
            <input id="contactoTelefono" type="tel" inputMode="tel" autoComplete="tel-national" className={`${campo} rounded-l-none`}
              value={d.contactoTelefono} onChange={(e) => set("contactoTelefono", e.target.value)} placeholder="9 1234 5678" />
          </div>
        </Campo>
        <Campo id="contactoCorreo" label="Correo" error={err.contactoCorreo}>
          <input id="contactoCorreo" type="email" autoComplete="email" className={campo} value={d.contactoCorreo} onChange={(e) => set("contactoCorreo", e.target.value)} />
        </Campo>
      </Seccion>

      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`rounded-lg p-3 text-sm font-medium ${msg.ok ? "bg-teal-50 text-teal-900" : "bg-red-50 text-red-800"}`}>
          {msg.texto}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button disabled={pendiente} className="rounded-lg bg-teal-700 px-6 py-3 font-semibold text-white hover:bg-teal-800 disabled:opacity-60">
          {pendiente ? "Guardando..." : destino ? "Guardar y continuar" : "Guardar datos"}
        </button>
      </div>
    </form>
  );
}
