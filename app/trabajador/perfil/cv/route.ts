import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Abre el currículum vigente del trabajador con un enlace temporal (60 s).
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL("/ingresar", req.url));
  const { data: wp } = await supabase.from("worker_profiles").select("cv_path").eq("user_id", auth.user.id).maybeSingle();
  if (!wp?.cv_path) return NextResponse.redirect(new URL("/trabajador/perfil?paso=cv", req.url));
  const { data, error } = await supabase.storage.from("curriculums").createSignedUrl(wp.cv_path, 60);
  if (error || !data) return new NextResponse("No pudimos abrir el currículum.", { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
