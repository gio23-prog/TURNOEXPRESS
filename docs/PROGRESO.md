# Bitácora de avance

## Etapa 0 — Análisis y arquitectura ✅ (04/10/2026)
Ver ARQUITECTURA.md y CUMPLIMIENTO_LEGAL.md.

## Etapa 1 — Base de datos ✅ (04/10/2026)
Implementado y **probado contra PostgreSQL 16 real (81/81 pruebas pgTAP)**:
- 31 tablas con RLS, 2 vistas públicas, 52 comunas de la RM, 7 categorías y 34 subcategorías.
- Registro con consentimiento obligatorio; rol admin no auto-asignable.
- Publicación con validación de horarios, tarifa, ubicación, cuestionario de modalidad, límite por plan y revisión humana para riesgo laboral alto.
- Búsqueda con filtros (categoría con subcategorías, comunas, fechas, hoy/mañana/fin de semana, pocas horas, un día, por proyecto, tarifa mínima, texto, urgentes, distancia) y orden.
- Postulación (sin duplicados), estados validados, preselección, oferta con cupos y expiración, aceptación con disponibilidad confirmada, bloqueo de superposición horaria con excepción justificada.
- Resumen inmutable de condiciones; propuestas de cambio con aceptación de la contraparte; historial de estados; cancelación con autor y motivo; incidencias.
- Finalización por doble confirmación, evaluación mutua sólo tras finalizar.
- Registro de boletas emitidas externamente (folio y fecha obligatorios para "emitido"; "revisado" sólo por la empresa).
- Mensajería entre partes con interacción válida; notificaciones en app.
- Admin: revisión/suspensión de publicaciones, bloqueo, verificación, reseñas, denuncias, roles, configuración, métricas reales (excluye demo); auditoría.

No verificado aún: migración 5 (Storage y pg_cron) — requiere un proyecto Supabase real.

## Etapa 2 — Siguiente
Proyecto Next.js, identidad visual, registro/ingreso con selección de rol, perfiles de empresa y trabajador, layout móvil con navegación por rol. Datos demo marcados.

## Avance web (09/10/2026)
- Registro e ingreso con Supabase Auth; el alta envía `accepted_terms`/`accepted_privacy` como exige `handle_new_user()`.
- `proxy.ts` refresca la sesión y exige ingreso en `/empresa` y `/trabajador`; `/empresa` además exige rol empresa.
- Al ingresar se crea el perfil de empresa o trabajador si falta.
- Publicar turno conectado: categorías y comunas desde la BD, horario en hora de Chile (turnos nocturnos terminan al día siguiente), dirección en `job_post_private` y `publish_job()` decide si queda publicada o en revisión. Cuestionario de modalidad = columnas `q_*`.
- Pendiente: pregunta de "reemplazo" (relevante por EST) no tiene columna en la BD.
- Migración 6: registro exige mayoría de edad (`is_adult`, guarda `profiles.adult_confirmed_at`) y `job_posts.q_replaces_staff` (informativa, no altera el riesgo). Pruebas pgTAP: 83/83.
- Landing, metadatos en español, README, `.env.example` (`NEXT_PUBLIC_SITE_URL` para el correo de confirmación) y cabeceras de seguridad básicas. Pendiente: CSP y límites de frecuencia.

## Identidad visual (09/10/2026)
- Logos en `public/logo/` (originales recortados con márgenes uniformes; `logo-sin-eslogan.png` regenerado desde `logo-completo.png` porque el entregado venía cortado abajo; íconos cuadrados desde `icon-512.png`). `app/favicon.ico`, íconos PNG y `app/manifest.ts`.
- Paleta en `app/globals.css` (`@theme`): marino #0F172A, turquesa #0D9488 (acentos), turquesa-oscuro #0F766E (botones y enlaces, contraste AA). Fondo blanco fijo.
- Encabezado con menú móvil (`components/`); ingreso y registro con logo completo. Páginas con encabezado en el grupo `app/(sitio)/` (las URL no cambian).

## Pantallas del trabajador (09/10/2026)
- `/trabajos` (público): buscador con `search_jobs` (categoría, comuna, cuándo/duración, texto, valor hora mínimo, urgentes, orden, páginas de 20). Sin filtro de distancia ni "proyecto" (coordenadas de comunas pendientes).
- `/trabajos/[id]` (con sesión): solo columnas públicas de `job_posts`, empresa desde `v_public_businesses`, requisitos, aviso de choque (`my_overlapping_bookings`) y postulación con `apply_to_job`.
- `/trabajador/postulaciones`: lista propia y retiro con `withdraw_application`.
- Inicio del trabajador tras ingresar: `/trabajos`. Sin cambios de esquema ni RLS.
- Probado en local con PostgREST + sesión simulada: buscar y filtrar, postular (validación de disponibilidad), ver estado, retirar, redirecciones por rol.
- Pendiente: responder ofertas (`respond_offer`), perfil editable del trabajador, lado empresa de postulaciones.

## Fase 2 · Etapa 1 — Encuadre legal en la interfaz (09/10/2026)
- Textos sin lenguaje de contratación ("quien sea contratado", "te hace una oferta", "Oferta recibida", "Confirma y evalúa").
- Aviso de medio de difusión y casilla obligatoria antes de publicar (compromisos de la empresa) y antes de postular; validados también en el servidor.
- Borradores de `/terminos`, `/privacidad` y `/aviso-legal`, marcados "pendiente de revisión legal", con versión (`lib/legal.ts`).
- Registro con enlaces a términos y privacidad; pie de página legal en todo el sitio; aviso en ingreso y registro.
- Páginas 404, error de página y error global con la marca.
- Probado en local (PostgREST + sesión simulada): páginas legales, 404, postular sin y con aviso, publicar sin y con compromisos.
- Pendiente: guardar la versión aceptada (`terms_version`, etapa 2); textos de correos (etapa 10).
