const ZONA = "America/Santiago";

const formato = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONA,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Diferencia en minutos entre la hora de Chile y UTC en ese instante (cambia con el horario de verano). */
function desfaseMin(ts: number): number {
  const p = Object.fromEntries(formato.formatToParts(new Date(ts)).map((x) => [x.type, Number(x.value)]));
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ts) / 60000;
}

/** Convierte fecha "AAAA-MM-DD" y hora "HH:MM" de Chile continental a un instante absoluto. */
export function instanteChile(fecha: string, hora: string): Date {
  const [a, m, d] = fecha.split("-").map(Number);
  const [h, mi] = hora.split(":").map(Number);
  const local = Date.UTC(a, m - 1, d, h, mi);
  let ts = local - desfaseMin(local) * 60000;
  ts = local - desfaseMin(ts) * 60000; // corrige si el primer cálculo cruzó un cambio de horario
  return new Date(ts);
}

/** Día siguiente a "AAAA-MM-DD", en el mismo formato. */
export function diaSiguiente(fecha: string): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
}
