import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** false en un entorno sin variables de Supabase (p. ej. un build local sin .env). */
export const supabaseConfigurado = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export async function createClient() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (lista) => {
          try {
            lista.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // Se ignora cuando se llama desde un Server Component; proxy.ts refresca la sesión.
          }
        },
      },
    }
  );
}