// Validación y formato de RUT chileno (módulo 11). Misma regla que rut_is_valid() en la base.

export function limpiarRut(rut: string) {
  return rut.replace(/[^0-9kK]/g, "").toUpperCase();
}

export function rutValido(rut: string) {
  const r = limpiarRut(rut);
  if (r.length < 2 || r.length > 9) return false;
  const cuerpo = r.slice(0, -1);
  const dv = r.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return false;
  let suma = 0;
  let m = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * m;
    m = m === 7 ? 2 : m + 1;
  }
  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
  return dv === esperado;
}

/** 76086428-5 → 76.086.428-5 */
export function formatearRut(rut: string) {
  const r = limpiarRut(rut);
  if (r.length < 2) return r;
  const cuerpo = r.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${cuerpo}-${r.slice(-1)}`;
}
