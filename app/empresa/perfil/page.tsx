import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EmpresaInput } from "@/lib/schemas/empresa";
import Encabezado, { obtenerSesion } from "@/app/componentes/encabezado";
import FormularioEmpresa from "./formulario";

// Solo se permite volver a rutas internas conocidas (evita redirecciones abiertas).
const DESTINOS = ["/empresa/publicar"];

export default async function PerfilEmpresa({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/ingresar");

  if (sesion.role !== "empresa") {
    return (
      <div className="min-h-full bg-stone-50 text-stone-900">
        <Encabezado sesion={sesion} />
        <main className="mx-auto max-w-xl px-4 py-10">
          <h1 className="text-2xl font-bold">Solo para empresas</h1>
          <p className="mt-2 text-stone-700">Tu cuenta es de trabajador.</p>
          <Link href="/" className="mt-6 inline-block font-medium text-teal-800 underline">Volver al inicio</Link>
        </main>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: b }, { data: regs }, { data: coms }] = await Promise.all([
    supabase
      .from("business_profiles")
      .select("trade_name, legal_name, rut, giro, business_type, sector, employees_range, shifts_per_month, description, comuna_id, fiscal_address, legal_rep_name, legal_rep_rut, contact_name, contact_position, contact_phone, contact_email")
      .eq("user_id", sesion.id)
      .maybeSingle(),
    supabase.from("regions").select("id, name, sort_order").eq("active", true).order("sort_order"),
    supabase.from("comunas").select("id, name, region_id").eq("active", true).order("name"),
  ]);

  const comunas = (coms ?? []).map((c) => ({ id: c.id as number, nombre: c.name as string, regionId: c.region_id as number }));
  const regiones = (regs ?? []).map((r) => ({ id: r.id as number, nombre: r.name as string }));
  const regionActual = comunas.find((c) => c.id === b?.comuna_id)?.regionId;

  const inicial: EmpresaInput = {
    nombreComercial: b?.trade_name ?? sesion.nombre,
    razonSocial: b?.legal_name ?? "",
    rutEmpresa: b?.rut ?? "",
    giro: b?.giro ?? "",
    rubro: b?.business_type ?? "",
    sector: b?.sector ?? "",
    tamano: b?.employees_range ?? "",
    turnosMes: b?.shifts_per_month ?? "",
    descripcion: b?.description ?? "",
    region: regionActual ? String(regionActual) : "",
    comuna: b?.comuna_id ? String(b.comuna_id) : "",
    direccionFiscal: b?.fiscal_address ?? "",
    repNombre: b?.legal_rep_name ?? "",
    repRut: b?.legal_rep_rut ?? "",
    contactoNombre: b?.contact_name ?? "",
    contactoCargo: b?.contact_position ?? "",
    contactoTelefono: b?.contact_phone ? String(b.contact_phone).replace(/^\+56/, "") : "",
    contactoCorreo: b?.contact_email ?? "",
  };

  const destinoPedido = typeof sp.destino === "string" ? sp.destino : null;
  const destino = destinoPedido && DESTINOS.includes(destinoPedido) ? destinoPedido : null;

  return (
    <div className="min-h-full bg-stone-50 text-stone-900">
      <Encabezado sesion={sesion} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-2xl font-bold tracking-tight">Datos de tu empresa</h1>
        <p className="mt-1 text-stone-600">Todos los campos son obligatorios salvo los marcados como opcionales.</p>
        <div className="mt-6">
          <FormularioEmpresa modo="perfil" inicial={inicial} regiones={regiones} comunas={comunas}
            completar={sp.completar === "1"} destino={destino} />
        </div>
      </main>
    </div>
  );
}
