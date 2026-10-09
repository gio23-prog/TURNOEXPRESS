import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { asegurarPerfilDeRol, inicioSegunRol } from "@/lib/supabase/perfil";

export async function GET(request: NextRequest) {
  // En Codespaces/Vercel la URL pública viene en estas cabeceras.
  const host = request.headers.get("x-forwarded-host") ?? new URL(request.url).host;
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const base = `${proto}://${host}`;

  const code = new URL(request.url).searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const rol = await asegurarPerfilDeRol(supabase);
      return NextResponse.redirect(`${base}${inicioSegunRol(rol)}`);
    }
  }
  return NextResponse.redirect(`${base}/ingresar`);
}