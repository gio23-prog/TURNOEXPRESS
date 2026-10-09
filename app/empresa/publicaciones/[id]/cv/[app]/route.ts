import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { esUUID } from "@/lib/formato";

// Abre el currículum enviado con una postulación. La base solo lo permite a la empresa dueña del turno.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; app: string }> }) {
  const { id, app } = await params;
  if (!esUUID(id) || !esUUID(app)) return new NextResponse("No encontrado", { status: 404 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL("/ingresar", req.url));
  const { data: a } = await supabase.from("applications").select("cv_path").eq("id", app).eq("job_id", id).maybeSingle();
  if (!a?.cv_path) return new NextResponse("Esta postulación no tiene currículum.", { status: 404 });
  const { data, error } = await supabase.storage.from("curriculums").createSignedUrl(a.cv_path, 60);
  if (error || !data) return new NextResponse("No pudimos abrir el currículum.", { status: 403 });
  return NextResponse.redirect(data.signedUrl);
}
