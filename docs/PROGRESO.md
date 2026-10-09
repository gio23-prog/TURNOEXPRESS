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
