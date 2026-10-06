# TurnoExpress (nombre provisional)

Marketplace de trabajos express para Chile: negocios publican turnos urgentes, trabajadores independientes postulan desde el teléfono.

**Estado:** Etapas 0 y 1 completas (arquitectura + base de datos con reglas de negocio y seguridad, 81 pruebas pasando). La aplicación web Next.js es la Etapa 2. Ver `docs/PROGRESO.md`.

## Estructura

```
docs/
  ARQUITECTURA.md          Análisis, riesgos, arquitectura, pantallas, flujos, modelo de datos, plan
  CUMPLIMIENTO_LEGAL.md    Verificaciones legales y tributarias para revisión profesional
  PROGRESO.md              Bitácora de avance (desde aquí se continúa)
supabase/
  migrations/              Esquema completo (aplicar en orden)
    ..._base.sql           Tipos, RUT, riesgo laboral, comunas RM, categorías
    ..._core.sql           Tablas, restricciones, índices, historial
    ..._security.sql       Privilegios por columna, RLS, vistas públicas
    ..._business_logic.sql RPC: publicar, postular, ofertar, contratar, finalizar, evaluar, boletas, admin, búsqueda, métricas
    ..._storage_cron.sql   Buckets privados y pg_cron (sólo en Supabase)
  tests/database/          Pruebas pgTAP
  local/                   Stub de auth para probar en Postgres sin Supabase
scripts/test-db-local.sh
.env.example
```

## Configurar la base de datos en Supabase

1. Crea un proyecto en supabase.com (región São Paulo). Plan gratuito suficiente para el piloto.
2. Instala la CLI: `npm i -g supabase` y luego `supabase login`.
3. En esta carpeta: `supabase init` (si pregunta, conserva la carpeta `migrations`), `supabase link --project-ref <ref>`.
4. Aplica el esquema: `supabase db push`.
5. Ejecuta las pruebas: `supabase test db`.
6. Crea tu usuario desde la app (o desde Auth en el panel) y otórgate superadmin una sola vez en el SQL Editor:
   `insert into admin_roles (user_id, level) values ('<tu-uuid>', 'superadmin');`
7. En Auth → Providers deja habilitado Email y activa "Confirm email".

## Probar localmente sin Supabase

Requiere PostgreSQL 16 con `postgresql-16-pgtap`:

```bash
PGHOST=localhost PGUSER=postgres PGPASSWORD=... ./scripts/test-db-local.sh
```

## Datos de demostración

Aún no se cargan. Cuando se agreguen (Etapa 2), las cuentas tendrán `profiles.is_demo = true` y se excluyen automáticamente de las métricas del panel admin.
