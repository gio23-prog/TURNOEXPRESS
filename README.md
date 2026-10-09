# TurnoExpress

Marketplace de turnos por horas para la Región Metropolitana (nombre provisional).
Next.js 16 (App Router) + Supabase (Postgres, Auth, Storage).

- Arquitectura y decisiones: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md)
- Riesgos legales y tributarios pendientes: [`docs/CUMPLIMIENTO_LEGAL.md`](docs/CUMPLIMIENTO_LEGAL.md)
- Bitácora de avance: [`docs/PROGRESO.md`](docs/PROGRESO.md)

## Puesta en marcha

1. Crea un proyecto en Supabase y aplica las migraciones de `supabase/migrations/` en orden
   (`supabase db push` con la CLI, o pegándolas en el editor SQL).
2. Copia `.env.example` a `.env.local` y completa las variables.
3. En Supabase → Authentication → URL Configuration agrega `<tu URL>/auth/callback` como URL de redirección.
4. Instala y levanta:

```bash
npm install
npm run dev
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en http://localhost:3000 |
| `npm run build` | Compilación de producción |
| `npm run lint` | ESLint |
| `./scripts/test-db-local.sh` | Pruebas pgTAP del esquema contra un PostgreSQL 16 local (requiere pgTAP y btree_gist) |

## Estructura

| Ruta | Contenido |
|---|---|
| `app/` | Páginas y Server Actions (`registro`, `ingresar`, `empresa/publicar`, `auth/callback`) |
| `proxy.ts` | Refresca la sesión y exige ingreso en `/empresa` y `/trabajador` |
| `lib/schemas/` | Validación Zod compartida entre formulario y servidor |
| `lib/supabase/` | Cliente de servidor y utilidades de perfil |
| `supabase/migrations/` | Esquema, RLS y reglas de negocio (la base es la autoridad) |
| `supabase/tests/` | Pruebas pgTAP |
