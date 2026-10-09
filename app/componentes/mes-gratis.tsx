import { fecha } from "@/lib/formato";

/** Aviso del mes gratis de la empresa. Aún no hay cobros: el precio se informará antes de cobrar. */
export function AvisoMesGratis({ plan }: { plan: { fin: string; dias: number } | null }) {
  if (!plan) return null;
  const vigente = plan.dias > 0;
  return (
    <p className={`rounded-xl border p-3 text-sm ${vigente ? "border-teal-200 bg-teal-50 text-teal-950" : "border-stone-200 bg-white text-stone-700"}`}>
      {vigente ? (
        <>
          <span className="font-semibold">Mes gratis hasta el {fecha(plan.fin)}</span>
          {" "}({plan.dias === 1 ? "queda 1 día" : `quedan ${plan.dias} días`}).
        </>
      ) : (
        <>
          <span className="font-semibold">Tu mes gratis terminó el {fecha(plan.fin)}.</span> Por ahora puedes seguir publicando
          sin costo. Antes de cobrar te informaremos el precio y tendrás que aceptarlo.
        </>
      )}
    </p>
  );
}
