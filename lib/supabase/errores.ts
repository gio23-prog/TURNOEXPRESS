// Las RPC lanzan P0001/P0002 con mensajes pensados para el usuario; el resto se oculta.
export function mensajeDeError(e: { code?: string; message: string }, generico: string) {
  return e.code === "P0001" || e.code === "P0002" ? e.message : generico;
}
