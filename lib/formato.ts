// Formatos chilenos: CLP, DD/MM/AAAA y 24 horas, siempre en hora de Santiago.

const TZ = "America/Santiago";

export const clp = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

function partes(iso: string) {
  const p = new Intl.DateTimeFormat("es-CL", {
    timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    weekday: "long",
  }).formatToParts(new Date(iso));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { dia: v("day"), mes: v("month"), anio: v("year"), hora: v("hour"), min: v("minute"), semana: v("weekday") };
}

/** 09/10/2026 */
export function fecha(iso: string) {
  const p = partes(iso);
  return `${p.dia}/${p.mes}/${p.anio}`;
}

/** 18:00 */
export function hora(iso: string) {
  const p = partes(iso);
  return `${p.hora}:${p.min}`;
}

/** "Hoy", "Mañana" o "viernes 09/10/2026" */
export function diaRelativo(iso: string) {
  const hoy = partes(new Date().toISOString());
  const manana = partes(new Date(Date.now() + 86_400_000).toISOString());
  const p = partes(iso);
  const clave = (x: typeof p) => `${x.anio}${x.mes}${x.dia}`;
  if (clave(p) === clave(hoy)) return "Hoy";
  if (clave(p) === clave(manana)) return "Mañana";
  return `${p.semana} ${p.dia}/${p.mes}/${p.anio}`;
}

/** 6 h · 4 h 30 min · 45 min */
export function duracion(minutos: number) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Fecha de hoy en Chile como AAAA-MM-DD (para inputs de fecha). */
export function hoyISO() {
  const p = partes(new Date().toISOString());
  return `${p.anio}-${p.mes}-${p.dia}`;
}

export const esUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
