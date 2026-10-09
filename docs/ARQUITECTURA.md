# TurnoExpress (nombre provisional) — Arquitectura del MVP

## 1. Evaluación del entorno

El desarrollo se está haciendo en un contenedor Linux (Ubuntu 24.04, Node 22, 1 CPU, 4 GB RAM) sin acceso a servicios externos salvo registros de paquetes. Se instaló PostgreSQL 16 con pgTAP y btree_gist para probar el esquema contra una base real. No hay credenciales de Supabase, Vercel ni proveedores de correo/SMS: todo lo que dependa de ellos queda preparado y documentado, nunca simulado.

Consecuencia práctica: la capa de datos, permisos y reglas de negocio está **construida y probada**. La aplicación web se construye en las etapas siguientes y se prueba localmente contra esta misma base; el despliegue real requiere que crees el proyecto Supabase (gratuito) y conectes las variables de entorno.

## 2. Arquitectura elegida

| Capa | Tecnología | Motivo |
|---|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript | SSR para SEO de la landing y ofertas; Server Actions para mutaciones |
| UI | Tailwind CSS + shadcn/ui (Radix) | Componentes accesibles, sin dependencia visual de terceros |
| Datos | PostgreSQL 16 (Supabase) | Restricciones fuertes, exclusión por rangos horarios, RLS |
| Autenticación | Supabase Auth (correo + contraseña, OTP por correo) | Sesiones seguras con cookies httpOnly vía `@supabase/ssr` |
| Archivos | Supabase Storage, buckets privados | Boletas y fotos con URLs firmadas de corta duración |
| Validación | Zod, esquemas compartidos cliente/servidor | Mismo esquema valida formulario y Server Action |
| Pruebas | pgTAP (BD), Vitest (unidades), Playwright (E2E) | |
| Tareas programadas | pg_cron (`refresh_time_states` cada 5 min) | Vencimiento de ofertas y publicaciones |
| Despliegue | Vercel + Supabase (región São Paulo, la más cercana) | |

**Principio central: la base de datos es la autoridad.** Ninguna regla crítica vive sólo en la interfaz. Tres capas de defensa:

1. **Privilegios por columna**: el rol `authenticated` no puede escribir columnas `status`, `verification_status`, `is_blocked` ni roles. Aunque alguien manipule la interfaz o llame directamente a la API, recibe `permission denied`.
2. **Row Level Security** en las 31 tablas: cada usuario ve sólo lo que le corresponde.
3. **Funciones RPC `SECURITY DEFINER`**: todas las transiciones de estado (publicar, postular, ofertar, aceptar, finalizar, cancelar, evaluar) validan reglas, registran auditoría y notifican.

## 3. Riesgos y decisiones pendientes

**Riesgo legal principal (alto).** El caso de uso emblemático —reemplazar hoy a un garzón ausente, con horario fijo, bajo instrucciones del restaurante— presenta varios indicios de relación laboral. Además, el suministro de personal para reemplazos temporales es una actividad regulada en Chile para Empresas de Servicios Transitorios. El diseño no "resuelve" esto: lo hace visible (cuestionario obligatorio, advertencias, revisión humana) y evita afirmar que todo puede pagarse con boleta. Ver `CUMPLIMIENTO_LEGAL.md`. **Esta revisión legal debería hacerse antes de lanzar con usuarios reales**, porque puede cambiar el modelo de negocio (por ejemplo, operar como marketplace de servicios independientes reales vs. asociarse con una EST para turnos subordinados).

**Decisiones que tomé y puedes revertir:**
- Un turno = una publicación de máximo 24 h. Los turnos de varios días se crean como serie (`series_id`) de publicaciones.
- La dirección exacta se guarda aparte (`job_post_private`) y sólo la ve quien queda contratado.
- Riesgo laboral alto + modalidad declarada "prestación independiente" ⇒ la publicación queda **en revisión** antes de ser visible.
- Oferta expira en 12 h o al inicio del turno (configurable).
- Monetización desactivada (`platform_settings.monetization.enabled = false`), planes con precio 0 y límite de 5 publicaciones activas en plan gratuito. No se cobra al trabajador.
- Distancia aproximada: por centroide de comuna (sin guardar ubicación del usuario). **Pendiente cargar coordenadas** de las 52 comunas desde fuente oficial.

**Pendiente de tu parte:** verificar disponibilidad de "TurnoExpress" en INAPI (clases 9, 35 y 42) y NIC Chile. Una búsqueda web rápida no mostró un servicio con ese nombre, pero eso no reemplaza la búsqueda de marca.

## 4. Pantallas y navegación

| # | Pantalla | Ruta | Rol |
|---|---|---|---|
| 1 | Landing | `/` | Público |
| 2 | Registro / ingreso | `/registro`, `/ingresar` | Público |
| 3 | Selección de tipo de cuenta | `/registro` (paso 1) | Público |
| 4 | Perfil del trabajador | `/trabajador/perfil` | Trabajador |
| 5 | Perfil de empresa | `/empresa/perfil` | Empresa |
| 6 | Buscador de trabajos | `/trabajos` | Todos |
| 7 | Detalle de oferta | `/trabajos/[id]` | Todos |
| 8 | Publicar turno (4 pasos + vista previa) | `/empresa/publicar` | Empresa |
| 9 | Postulaciones recibidas | `/empresa/publicaciones/[id]` | Empresa |
| 10 | Mis postulaciones y ofertas | `/trabajador/postulaciones` | Trabajador |
| 11 | Detalle de contratación | `/contrataciones/[id]` | Partes |
| 12 | Calendario de turnos | `/trabajador/calendario` | Trabajador |
| 13 | Historial | `/historial` | Ambos |
| 14 | Evaluaciones | `/perfil/evaluaciones` | Ambos |
| 15 | Centro de ayuda y reportes | `/ayuda` | Todos |
| 16 | Configuración y privacidad | `/configuracion` | Ambos |
| 17 | Panel administrativo | `/admin/*` | Admin |
| 18 | Guía tributaria y de modalidad | `/guia` | Todos |

Navegación móvil: barra inferior con 4 accesos por rol (trabajador: Buscar · Postulaciones · Calendario · Perfil; empresa: Publicar · Mis turnos · Mensajes · Perfil).

**Formulario de publicación (objetivo: < 2 minutos):**
1. *Qué*: categoría → subcategoría, título sugerido, descripción, cupos.
2. *Cuándo y dónde*: fecha, inicio/término (24 h), comuna, dirección privada, urgencia.
3. *Pago y condiciones*: total o por hora, con cálculo en vivo de duración y valor hora; pausas, vestimenta, alimentación, transporte.
4. *Modalidad*: 5 preguntas sí/no, riesgo orientativo con explicación y confirmación de advertencia si corresponde.
5. *Vista previa* → Publicar.

## 5. Flujo de contratación (máquina de estados)

```
Publicación:  borrador → publicada ─┬→ con_postulaciones → cubierta → en_curso → finalizada
                       └→ en_revision (riesgo alto) ─→ publicada | cancelada
              (cualquier estado abierto) → cancelada · vencida (cron)

Postulación:  pendiente → en_revision → preseleccionada → oferta_enviada → aceptada → finalizada
                 └──────────────┴──────────────┴→ rechazada        ├→ rechazada (trabajador declina)
              (trabajador) → retirada                              └→ incidencia_reportada

Contratación: confirmada → en_curso (1.ª confirmación o cron) → finalizada (ambas partes)
                 └→ cancelada (con motivo, autor y fecha)    └→ incidencia
```

Cada cambio de estado de una contratación queda en `booking_status_history`. Los cambios de horario o tarifa requieren propuesta y aceptación de la contraparte (`booking_change_requests`) y actualizan el resumen de condiciones.

## 6. Modelo de datos

31 tablas, todas con RLS. Las principales reglas a nivel de base de datos:

| Regla | Implementación |
|---|---|
| No postular dos veces | `unique (job_id, worker_id)` en `applications` |
| No dos turnos superpuestos | Restricción de exclusión GiST sobre `tstzrange(starts_at, ends_at)` por trabajador, excepto si hay justificación escrita |
| Horarios coherentes | `ends_at > starts_at`, máximo 24 h, plazo de postulación ≤ inicio |
| Duración y valor hora | Columnas generadas `duration_minutes`, `hourly_equivalent_clp`, `estimated_total_clp` |
| Ubicación obligatoria si es presencial | `check (modality = 'remoto' or comuna_id is not null)` |
| Reseña sólo de servicio finalizado | Validado en `submit_review`; única por parte y contratación |
| Boleta "emitida" exige evidencia | `check` que exige folio y fecha |
| Cancelación con registro | `check ((status='cancelada') = (cancelled_at is not null))` + autor + historial |
| RUT válido | `rut_is_valid()` módulo 11 |
| Teléfono chileno | `^\+56[0-9]{9}$` |
| Admin no auto-asignable | Trigger de alta rechaza rol admin; `admin_roles` sin privilegio de escritura |

Tablas: `profiles`, `admin_roles`, `business_profiles`, `worker_profiles`, `worker_categories`, `worker_skills`, `worker_availability`, `service_areas`, `regions`, `comunas`, `categories`, `skills`, `job_posts`, `job_post_private`, `job_requirements`, `applications`, `offers`, `bookings`, `booking_status_history`, `booking_change_requests`, `conversations`, `messages`, `reviews`, `tax_documents`, `reports`, `notifications`, `plans`, `subscriptions`, `payments`, `platform_settings`, `audit_logs`. Vistas públicas: `v_public_businesses`, `v_worker_ratings`.

## 7. Seguridad y privacidad

Implementado en BD: aislamiento por RLS, privilegios por columna, funciones con `search_path` fijo, auditoría de acciones administrativas, bloqueo de usuarios (que además pasa sus publicaciones a revisión), consentimiento obligatorio en el registro, RUT/teléfono/dirección nunca expuestos públicamente, perfiles de trabajador con opción privada, documentos en buckets privados por carpeta de usuario.

A implementar en la capa web (Etapa 2+): límites de frecuencia en Server Actions (registro, postulación, mensajes, reportes), cabeceras CSP y anti-clickjacking, sanitización de texto libre al renderizar (React escapa por defecto; prohibido `dangerouslySetInnerHTML` con contenido de usuarios), captcha en registro, URLs firmadas de 60 s para documentos, `service_role` sólo en servidor.

## 8. Plan por etapas

| Etapa | Contenido | Estado |
|---|---|---|
| 0 | Análisis, riesgos, arquitectura | ✅ |
| 1 | Esquema, migraciones, RLS, reglas de negocio, 81 pruebas | ✅ |
| 2 | Proyecto Next.js, identidad visual, auth con consentimiento, perfiles, layout móvil | ⏳ siguiente |
| 3 | Publicar turno (wizard), buscador con filtros, detalle, postular | |
| 4 | Paneles empresa/trabajador, ofertas, contratación, finalización, evaluaciones, boletas, notificaciones, mensajería básica | |
| 5 | Panel admin, guía tributaria, centro de ayuda, landing, pruebas E2E, despliegue | |
