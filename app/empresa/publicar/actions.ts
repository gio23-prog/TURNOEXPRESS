"use server";

import { validarTodo, type Borrador } from "@/lib/schemas/publicar";

type Resultado = { ok: boolean; mensaje: string; errores?: Record<string, string> };

export async function publicarTurno(datos: Borrador): Promise<Resultado> {
  // 1. Misma validación que el formulario (nunca confiar solo en el cliente).
  const errores = validarTodo(datos);
  if (Object.keys(errores).length > 0) {
    return { ok: false, mensaje: "Hay campos por corregir.", errores };
  }

  // 2. TODO (cuando exista lib/supabase/server.ts y conozcas el nombre de tu RPC):
  //
  //   const supabase = await createClient();
  //   const { error } = await supabase.rpc("<nombre_de_tu_rpc_publicar>", { ...parámetros });
  //   if (error) return { ok: false, mensaje: error.message };
  //
  // La RPC debe validar permisos, recalcular el riesgo y dejar la publicación
  // "en revisión" si corresponde, registrando auditoría.

  return { ok: true, mensaje: "Turno enviado. (Aún sin conexión a Supabase: falta llamar a la RPC.)" };
}