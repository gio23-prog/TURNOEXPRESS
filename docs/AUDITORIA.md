# Auditoría Turnoexpress — Fase 1

> Fecha: 09/10/2026 · Alcance: `app/`, `components/`, `lib/`, `supabase/migrations/`, `supabase/tests/`, `scripts/`, `docs/`.
> Base revisada: rama `claude/exciting-mccarthy-iv6o3i` (PR #1, **sin fusionar**) y `main`.
> **Este documento no es asesoría legal.** Lo marcado ⚖️ debe validarlo un abogado. Las normas se citan solo cuando se
> verificaron en fuentes (al final); lo no verificado se marca "a confirmar".

**Cómo se verificó:**
- **Lectura completa del código.**
- **Base de datos:** las 6 migraciones se aplicaron sobre PostgreSQL 16 local y pasaron las pruebas pgTAP, 83/83.
- **Permisos:** consulta directa de las políticas RLS y de los privilegios de cada tabla.
- **Flujos del trabajador:** se probaron de punta a punta con PostgREST local y una sesión simulada.
- **Normas:** búsqueda web de las normas citadas.

**No verificado:**
- el proyecto Supabase real;
- la migración 5 (Storage y pg_cron);
- Lighthouse y Core Web Vitals, que no se midieron.

---

## 0. Resumen ejecutivo

1. **Contradicción central.** El esquema actual implementa un **intermediario**: ofertas con cupos y aceptación,
   "contrataciones" (bookings), cambios de condiciones, cierre por doble confirmación, boletas y comisión por
   contratación. Eso choca con el posicionamiento de **medio de difusión**, y es el riesgo legal más alto.
2. **No hay términos ni política de privacidad.** El registro pide aceptar documentos que no existen, así que el
   consentimiento no es válido.
3. **Lo desplegable está desfasado.**
   - `main` tiene el registro roto: envía `consent` y la base exige `accepted_terms` y `accepted_privacy`.
   - Lo que está corregido vive en el PR #1, sin fusionar.
   - El PR depende de la migración 6, que no está aplicada.
4. **Google for Jobs no es posible hoy.** El detalle de una oferta exige sesión, porque `job_posts` no es legible
   sin ella.
5. **Base técnica sólida.**
   - RLS activo en las 31 tablas.
   - Todas las funciones `SECURITY DEFINER` tienen `search_path` fijo.
   - Las transiciones de estado ocurren solo por funciones.
   - `service_role` no se usa en la app.

### Choques con lo que pediste
| Pedido | Situación en el repo |
|---|---|
| "Existe `/trabajador` (marcador)" | No existe. Hay `/trabajos`, `/trabajos/[id]` y `/trabajador/postulaciones`, todo en el PR #1. |
| "Funcionan registro e ingreso con redirección por rol" | Solo en el PR #1. En `main`, el registro falla y el ingreso redirige a `/`. |
| "El trigger exige role, accepted_terms y accepted_privacy" | Correcto con las migraciones 1–4. La migración 6 (PR #1, no aplicada) además exige `is_adult`. |
| Turquesa #0D9488 | Blanco sobre #0D9488 tiene contraste 3,74:1 y no cumple AA para texto. Los botones usan #0F766E (5,47:1); #0D9488 queda para acentos. |
| Modo oscuro | Lo desactivé en la etapa de identidad, porque la figura y "Turno" en marino desaparecen sobre fondo oscuro. **Hace falta una variante del logo para fondo oscuro**, decisión de marca. |
| "Reutiliza `plans` y `payments`" | También existe `subscriptions`, con estados `activa`, `cancelada` y `vencida`, y `publish_job()` la usa. Ampliarla es un cambio de esquema que requiere tu OK (ver E5). |
| Migraciones nuevas "a continuación" | Ya existe `20261009000100_mayoria_edad_y_reemplazo.sql` (PR #1, no aplicada). Las nuevas deben numerarse después de ella, o hay que decidir antes si se mantiene. |

---

## 1. Hallazgos legales

| ID | Prioridad | Hallazgo | Dónde | Riesgo | Solución propuesta |
|---|---|---|---|---|---|
| L1 | 🔴 Crítico ⚖️ | **Funciones de intermediación y contratación**: ofertas con cupos, expiración y aceptación (`offers`, `send_offer`, `respond_offer`); `bookings` con `terms_snapshot` inmutable; `booking_change_requests`; cierre por doble confirmación (`confirm_completion`); bloqueo de turnos superpuestos del trabajador; dirección revelada "a quien sea contratado"; `tax_documents` (registro de boletas con folio); `payments.kind = 'comision'` ligado a `booking_id`; reseñas condicionadas a una contratación finalizada. | `20261004000200_core.sql` (offers, bookings, booking_change_requests, reviews, tax_documents, payments); `…400_business_logic.sql` (send_offer, respond_offer, confirm_completion, propose/respond_booking_change, register_tax_document); `…500_storage_cron.sql` (bucket `documentos-tributarios`) | La plataforma aparece cerrando acuerdos, administrando condiciones, registrando la ejecución y cobrando por contratación. Eso aumenta el riesgo de ser vista como intermediaria de suministro de personal (EST) o como corresponsable de la relación laboral. Contradice el posicionamiento de medio de difusión. | **Encuadre propuesto**, sin borrar datos: (a) "oferta" → **"la empresa quiere contactarte"**: abre la conversación y comparte la dirección, sin cupos ni aceptación con efecto contractual; (b) **congelar** bookings, cambios, cierre y boletas: no exponerlos en la interfaz y revocar `EXECUTE` de esas funciones con una migración nueva; (c) eliminar el modelo "comisión" y cobrar **solo una suscripción por publicar**; (d) reseñas condicionadas a "hubo contacto", con moderación. **Decisión de negocio tuya** y validación de un abogado laboralista. |
| L2 | 🔴 Crítico ⚖️ | **No hay términos de uso ni política de privacidad**, pero el registro obliga a aceptarlos. No se guarda la versión aceptada. | `app/registro/page.tsx` (casilla sin enlaces); `profiles.terms_accepted_at`/`privacy_accepted_at` sin versión | Consentimiento sin información previa: no cumple el deber de informar finalidades. Además, no se puede probar qué versión aceptó cada persona. | Crear `/terminos`, `/privacidad` y `/aviso-legal` como **borradores marcados "pendiente de revisión legal"**. Deben decir: medio de difusión; no es empleador; no contrata, no paga ni garantiza empleo; finalidades; plazos de conservación; derechos y cómo ejercerlos. Agregar la columna `terms_version` y su registro (migración nueva). |
| L3 | 🔴 Crítico | **Falta el aviso de medio de difusión antes de publicar y de postular.** La interfaz usa lenguaje de contratación: "quien sea contratado" (`formulario.tsx:174`, `trabajos/[id]/page.tsx:90`), "si te hace una oferta" (`trabajos/[id]/actions.ts:37`), "Oferta recibida" (`lib/formato.ts:24`), "Confirma y evalúa… condiciones quedan registradas" (`app/(sitio)/page.tsx:6`). | Interfaz | Refuerza la apariencia de intermediario (L1). | Reescribir esos textos. Agregar un aviso breve y una casilla obligatoria antes de publicar ("Eres el único responsable de la oferta y de la relación con quien contrates…") y antes de postular ("Turnoexpress no es el empleador…"). Usar el mismo texto en los correos. |
| L4 | 🟠 Alto ⚖️ | **Ley 21.719 de protección de datos**: según las fuentes revisadas, entra en vigencia el **1 de diciembre de 2026**. Existe un **proyecto del Ejecutivo para postergarla al 1 de diciembre de 2027**, sin confirmación de aprobación. Hoy rige la Ley 19.628. Faltan: derechos de acceso, rectificación, supresión, oposición y portabilidad ejercibles desde la cuenta; política de retención; registro de actividades de tratamiento; procedimiento de notificación de brechas; base de licitud por finalidad; minimización en documentos. | Sin implementar | Sanciones de la nueva Agencia una vez vigente, y desconfianza de los usuarios. | Diseñar ya según la Ley 21.719: página "Mis datos" con descarga y eliminación, `docs/TRATAMIENTOS.md` (inventario), plan de retención (ver C6), procedimiento de brechas. ⚖️ Confirmar el estado de la postergación en el Senado y en la BCN. |
| L5 | 🟠 Alto ⚖️ | **No discriminación en avisos.** El Código del Trabajo (art. 2) considera infracción la oferta de trabajo que, "directamente o por la vía de terceros" y por cualquier medio, exija condiciones protegidas: edad, sexo, nacionalidad, apariencia, entre otras. La Dirección del Trabajo puede fiscalizarla. Hoy no hay ningún control sobre el texto de las publicaciones. | `formulario.tsx`, `publish_job()` | Avisos discriminatorios publicados en la plataforma: riesgo reputacional y eventual responsabilidad. ⚖️ Alcance para el medio que publica: a confirmar. | Detector de términos sensibles al publicar (edad, sexo, "buena presencia", foto, nacionalidad…) con explicación y **revisión humana**, no rechazo automático silencioso. Botón "Reportar aviso". Guía de redacción inclusiva. |
| L6 | 🟠 Alto ⚖️ | **Certificado de antecedentes.** Según la Dirección del Trabajo, por regla general **no puede exigirse para postular**, salvo que sea indispensable para la idoneidad del cargo (por ejemplo, trabajo con menores). El Dictamen N° 541/24 (agosto de 2025) prohíbe requerir, almacenar o usar datos sin relación directa con la idoneidad, incluidos los antecedentes penales. El art. 154 ter del Código del Trabajo exige reserva de los datos privados del trabajador. | Pedido nuevo (billetera) | Facilitar exigencias ilegales y almacenar datos de alta sensibilidad. | Solo **en categorías habilitadas por el administrador**, con **justificación escrita obligatoria** visible para quien postula, revisión de la publicación, **nunca como filtro, orden ni rechazo automático**, compartido solo con consentimiento por postulación y con retención corta. ⚖️ El abogado define qué cargos califican, si la plataforma puede custodiar el documento o solo permitir compartirlo, y su calidad de dato sensible bajo la Ley 21.719. |
| L7 | 🟠 Alto ⚖️ | **Cobro recurrente y prueba gratis.** Según una fuente secundaria, la Ley 21.398 (Pro Consumidor), que modifica la Ley 19.496, obliga a informar al contratar los medios y condiciones de término. **No se verificó el texto legal**, ni las reglas sobre avisos previos o el derecho de retracto en contratos electrónicos. | Pedido nuevo (suscripción) | Cobros discutibles ante el SERNAC. | Documentar en `docs/COBROS.md`: informar antes de la prueba que se cobrará y cuánto, avisar antes del primer cobro, cancelar en un clic por el mismo medio, comprobantes, sin renovación oculta. ⚖️ Validar con el texto vigente de la Ley 19.496. |
| L8 | 🟡 Medio ⚖️ | **Ley 21.431 de plataformas digitales.** Define como empresa de plataforma digital de servicios a la que, a título oneroso, gestiona un sistema que permite que un trabajador ejecute servicios para los usuarios en un territorio. El modelo actual, con contrataciones gestionadas y cobro, se acerca más a esa definición que un tablón de avisos. | L1 | Obligaciones adicionales si califica. | Lo resuelve en buena parte el encuadre de L1. ⚖️ Confirmar con un abogado. |
| L9 | 🟡 Medio ⚖️ | **Cuestionario de "riesgo laboral" y pregunta de reemplazo** (`compute_labor_risk`, `q_replaces_staff`): útiles como advertencia, pero la plataforma "califica" la relación. `CUMPLIMIENTO_LEGAL.md` ya advierte del riesgo de EST. | `…100_base.sql`, migración 6 | Interpretarse como asesoría o como validación de la modalidad. | Mantenerlo como **ayuda informativa** con el texto "no es asesoría legal" y sin efecto de "aprobado". ⚖️ Revisar la redacción. |
| L10 | 🟡 Medio | **Edad mínima**: la migración 6 exige mayoría de edad, pero no está aplicada. | PR #1 | Registro de menores. | Decidir la migración 6 (ver T2). |
| L11 | 🟢 Bajo | El nombre "Turnoexpress" no se ha verificado en el INAPI (marcas) ni en NIC Chile (dominios). Pendiente desde la etapa 0. | `ARQUITECTURA.md` | Conflicto de marca. | Búsqueda de marca antes del lanzamiento. |

---

## 2. Hallazgos técnicos y de seguridad

| ID | Prioridad | Hallazgo | Dónde | Riesgo | Solución |
|---|---|---|---|---|---|
| T1 | 🔴 Crítico | **`main` tiene el registro roto**: envía `consent`/`consent_at` y el trigger exige `accepted_terms`/`accepted_privacy`. Todo lo corregido está en el PR #1. | `main:app/registro/actions.ts` | Si producción usa `main`, nadie puede registrarse. | Fusionar el PR #1 tras resolver T2. Confirmar desde qué rama despliegas. |
| T2 | 🔴 Crítico | **La migración 6** (`20261009000100…`) no está aplicada, y el código del PR escribe `q_replaces_staff` y envía `is_adult`. | PR #1 | Desplegar el PR sin la migración rompe la publicación de turnos. | Decidir: aplicarla (te muestro el SQL completo) o sacarla del PR junto con su código. |
| T3 | 🟠 Alto | **El detalle de una oferta exige sesión**: `job_posts` no tiene permiso de lectura para visitantes. | `app/(sitio)/trabajos/[id]/page.tsx` | Sin SEO por oferta, sin Google for Jobs y con más fricción para quien llega desde un enlace compartido. | Función nueva `get_public_job(id)` (`SECURITY DEFINER`, solo columnas públicas y solo publicaciones visibles), ejecutable por visitantes. Migración nueva. |
| T4 | 🟠 Alto | **Columnas internas legibles por cualquier usuario con sesión**: la política `job_read` deja leer todas las columnas de una publicación visible: `review_note` (nota del administrador), `q_*`, `labor_warning_ack_at`, `engagement_mode`. La app solo pide columnas públicas, pero la API las entrega. | `…300_security.sql` (grant select en job_posts) | Filtración de notas de moderación y de respuestas del cuestionario. | Con T3: la lectura pública pasa a una función o vista, y `review_note` se mueve a una tabla solo para administradores. Migración nueva. |
| T5 | 🟠 Alto | **Sin límites de intentos** en las acciones del servidor: postular, publicar, retirar y reportar. Supabase Auth tiene límites propios solo para la autenticación. | `app/**/actions.ts` | Abuso, spam de postulaciones y de avisos. | Tabla `rate_limits` y función en la base, o un servicio externo con KV, por usuario y por IP. Captcha en el registro, ya previsto en `ARQUITECTURA.md` §7. |
| T6 | 🟠 Alto | **Sin política CSP.** Solo hay cabeceras básicas (X-Frame-Options, nosniff, Referrer-Policy y Permissions-Policy), en el PR. | `next.config.ts` | XSS con mayor impacto. | CSP con *nonce* desde `proxy.ts`, según la guía de Next 16 (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`). |
| T7 | 🟠 Alto | **Migración 5 sin verificar** y diseñada para boletas (`documentos-tributarios`). La billetera de documentos necesita otra política de acceso. | `…500_storage_cron.sql` | Buckets o políticas incorrectas en producción. | Verificar en Supabase si se aplicó. Diseñar el bucket `documentos-trabajador` en una migración nueva (ver §4). |
| T8 | 🟡 Medio | **Sin páginas 404 y 500 propias** (`not-found.tsx`, `error.tsx`, `global-error.tsx`). | `app/` | Mala experiencia, pantallas en inglés. | Crearlas con la marca. |
| T9 | 🟡 Medio | **`platform_settings` legible por cualquier usuario con sesión**, y no por visitantes. | `…300_security.sql` | Si alguna vez se guarda un secreto ahí, se filtra. El banner de prueba gratis para visitantes no podría leer el interruptor. | Regla: **nunca guardar secretos** en esa tabla. Función `public_flags()` que exponga solo las banderas públicas. |
| T10 | 🟡 Medio | **`v_worker_ratings`** muestra a visitantes la nota de trabajadores con perfil privado (`is_public = false`). | `…300_security.sql` | Fuga menor de privacidad. | Filtrar por `can_view_worker` o `is_public`. Migración nueva. |
| T11 | 🟡 Medio | **Sin integración continua** (`.github/workflows` no existe) y sin pruebas de la app: solo pgTAP. | Repo | Regresiones como T1. | GitHub Actions con lint, tipos, build y pgTAP. Playwright para los flujos clave. |
| T12 | 🟡 Medio | **Backups y monitoreo no documentados**: copias con recuperación a un punto en el tiempo según el plan de Supabase, registro de errores y alertas. | — | Pérdida de datos y fallas silenciosas. | `docs/OPERACION.md` con backups, restauración probada y monitoreo de errores. |
| T13 | 🟡 Medio | **El encabezado consulta la sesión y el perfil en cada página**, y `/trabajos` se genera en cada visita, sin caché. | `components/Encabezado.tsx`, `trabajos/page.tsx` | Latencia y costo; dificulta la meta de Lighthouse 95. | Leer el rol del token, cachear los catálogos, usar `loading.tsx`. Medir con Lighthouse. |
| T14 | 🟢 Bajo | **`search_jobs`** no escapa `%` y `_` en el texto libre, que se usa con `ilike`. No es inyección SQL, pero permite patrones costosos. | `…400_business_logic.sql` | Consultas lentas. | Escapar en la app o en una nueva versión de la función. Evaluar búsqueda de texto completo con `tsvector`. |
| T15 | 🟢 Bajo | Quedan **archivos de plantilla sin uso** en `public/` (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`). `ARQUITECTURA.md` menciona shadcn/ui, que no está instalado. | `public/`, `docs/` | Ruido. | Borrarlos con tu OK y actualizar la documentación. |
| T16 | 🟢 Bajo | Una postulación **retirada no se puede volver a enviar** (`unique (job_id, worker_id)`). | `…200_core.sql` | Fricción. | Decisión de producto: permitir reactivar la postulación desde la función, en una migración nueva. |

**Lo que está bien y conviene conservar:**
- **Permisos:** RLS en las 31 tablas, privilegios por columna y estados que solo cambian por funciones auditadas.
- **Funciones:** `search_path` fijo en todas las `SECURITY DEFINER`.
- **Datos privados:** la dirección exacta vive en `job_post_private`.
- **Claves:** `service_role` no se usa en la app, y `.env*` está en `.gitignore`.
- **Validación:** Zod en el servidor.
- **Datos de prueba locales:** `supabase/local` está marcado "solo pruebas".

---

## 3. Hallazgos de producto y experiencia

| ID | Prioridad | Hallazgo | Solución |
|---|---|---|---|
| P1 | 🔴 Crítico | **Lado empresa incompleto**: no ve a sus postulantes, ni una lista de "mis publicaciones", ni puede editar o cancelar. Sin esto, el producto no cierra el ciclo. | Pantallas de mis publicaciones, postulantes (preseleccionar, descartar, "contactar") y cancelar con `cancel_job`, ya encuadradas según L1. |
| P2 | 🟠 Alto | **La portada no cumple lo pedido.** En `main` es la plantilla anterior; en el PR, una versión simple. | Nueva portada (§6, etapa 5). |
| P3 | 🟠 Alto | **El registro no recibe el tipo de cuenta elegido** (`/registro?tipo=trabajador`). | Leer el parámetro y saltar al paso 2. |
| P4 | 🟠 Alto | **Sin perfil editable del trabajador ni billetera**, así que no se puede postular "con un toque". | Perfil con categorías, comunas y disponibilidad (las tablas ya existen), más la billetera (§4). Postular con un toque usando el perfil y los documentos ya cargados. |
| P5 | 🟠 Alto | **Sin notificaciones visibles ni correos**: la tabla `notifications` existe, pero no tiene interfaz. Los correos de Supabase Auth usan plantillas por defecto. | Bandeja de notificaciones, plantillas de correo en español con el aviso de medio de difusión, y correos transaccionales de postulación y contacto. |
| P6 | 🟠 Alto | **Sin panel de moderación**: las funciones `admin_*` existen en la base (verificación de empresas, revisión de avisos, bloqueos, reportes), pero no tienen interfaz. Tampoco hay botón para reportar. | Panel `/admin` mínimo: cola de revisión, reportes, verificación de empresas. |
| P7 | 🟠 Alto | **Protección contra avisos falsos**: no hay señales. | Empresa verificada (RUT y correo de dominio, ⚖️ validar el tratamiento del RUT), límite de avisos para cuentas nuevas, detector de pedidos de dinero o datos ("paga para postular"), reportes. |
| P8 | 🟡 Medio | **SEO incompleto**: no hay `sitemap`, `robots`, Open Graph ni JSON-LD `JobPosting`. Depende de T3. | `app/sitemap.ts`, `app/robots.ts`, metadatos por oferta, `JobPosting` según la guía oficial de Google (ver §7). |
| P9 | 🟡 Medio | **PWA parcial**: hay manifiesto, pero no service worker ni funcionamiento sin conexión. | Service worker con caché de la estructura de la app y de la última búsqueda, más una página "sin conexión". |
| P10 | 🟡 Medio | **Sin modo oscuro**, por el conflicto con el logo. | Variante del logo para fondo oscuro, que es una decisión de marca, y paleta oscura en `@theme`. |
| P11 | 🟡 Medio | **Sin estructura multilenguaje**: los textos están escritos directamente en el código. | Diccionario `es-CL` en `lib/i18n/`, migrando por pantalla. |
| P12 | 🟡 Medio | **Sin analítica**, que hoy es lo correcto porque no hay rastreo. | Cuando se agregue, solo con un banner de consentimiento y una herramienta sin cookies o con cookies opcionales. |
| P13 | 🟡 Medio | **Distancia**: faltan las coordenadas de las 52 comunas. | Cargarlas desde una fuente oficial y declarar la fuente. |
| P14 | 🟢 Bajo | **Lighthouse no se midió.** | Medirlo en cada etapa. |

### Comparación con la competencia
Las búsquedas web **no entregaron datos verificables** de precios ni de funciones de Computrabajo, Chiletrabajos o
Bumeran en Chile. Solo una nota de prensa confirma que Computrabajo muestra a los candidatos el estado de sus
postulaciones. No afirmo nada más sobre ellos.

Las ventajas que podemos construir son propias del formato "turno por horas":
- **pago visible y obligatorio**, con valor hora calculado;
- **fecha y horario exactos**;
- postulación en un toque, con billetera de documentos;
- estado claro de cada postulación;
- verificación de empresas y un detector de avisos discriminatorios o fraudulentos;
- diseño para celular y conexiones lentas;
- sin CV obligatorio para turnos simples.

---

## 4. Diseño propuesto: billetera de documentos (resumen técnico)

**Todo va en migraciones nuevas, que te muestro antes.**

| Elemento | Propuesta |
|---|---|
| Bucket | `documentos-trabajador`, privado. Ruta `<uid>/<uuid>.<ext>`: el nombre original no se usa en la ruta y se guarda saneado aparte. Hasta 5 MB. Tipos `application/pdf`, `image/jpeg` e `image/png`. Se valida el tipo real del archivo por sus primeros bytes, en el servidor. |
| `worker_documents` | `doc_type` (cv, antecedentes, licencia, otro), `file_path`, `mime`, `size`, `sha256`, `original_name`, `license_class`, `license_expires_on`, `scan_status`, `created_at`, `deleted_at`. |
| `job_document_requirements` | `job_id`, `doc_type`, `level` (opcional u obligatorio), `justification`, obligatoria si es antecedentes o licencia. **Antecedentes** solo en categorías marcadas por el administrador. **Licencia** solo en categorías de conducción. |
| `application_document_shares` | `application_id`, `document_id`, `consented_at`, `revoked_at`, `expires_at`. Se crea **solo** si el trabajador marca compartir ese documento en esa postulación. |
| `document_access_log` | `document_id`, `share_id`, `accessor_id`, `accessed_at`. Solo inserción. El trabajador ve el suyo. |
| Acceso | Función `request_document_url(share_id)`: valida que quien la pide sea la empresa dueña de la publicación, que el documento esté compartido y vigente, y registra el acceso. Luego el servidor genera un **enlace firmado de 60 s**. La política de Storage permite leer a la empresa solo si existe un permiso de compartir vigente. Nada de `service_role` en el navegador. |
| Prohibición | Ninguna consulta ni función ordena o filtra postulaciones por documentos de antecedentes. Se agrega una prueba pgTAP que lo vigila. |
| Licencia | Tarea pg_cron diaria: notificación 30 y 7 días antes del vencimiento. |
| Retención (propuesta ⚖️) | **Compartidos:** expiran 30 días después de cerrada la publicación. **Antecedentes:** se borran automáticamente a los 90 días de cargados. **Otros documentos:** hasta que el trabajador los borre o tras 24 meses de inactividad. **Borrado:** inmediato en Storage y lógico en la tabla, conservando el registro de accesos. |
| Malware | Supabase no escanea archivos. Las opciones son una función con ClamAV o un servicio externo, ambos con costo. Mientras no exista, el estado queda en "no_escaneado" y se valida tipo y tamaño con rigor. **Decisión tuya.** |

## 5. Diseño propuesto: prueba gratis y suscripción (servidor, apagado)

- **`subscriptions`**: pasar a los estados `trial`, `active`, `past_due` y `canceled`, y agregar `trial_ends_at`,
  `current_period_end`, `provider_customer_ref` y `provider_subscription_ref`. **Es un cambio incompatible**: hoy existen
  `activa`, `cancelada` y `vencida`, y `publish_job()` filtra por `'activa'`. Propuesta:
  1. agregar los estados nuevos;
  2. convertir los registros existentes;
  3. actualizar `publish_job()` en la misma migración.

  **Requiere tu OK.**
- **`payments`**: dejar de usar `kind = 'comision'` y `booking_id`, sin borrar las columnas. Agregar
  `subscription_id`.
- **Cupones**: `coupons` (código, días de prueba, vencimiento, máximo de usos, activo) y `coupon_redemptions`
  (cupón, empresa, fecha), con canje solo por función y auditoría.
- **Interruptor**: `platform_settings.require_card_for_trial = false`. Si está apagado, la prueba se activa sin
  medio de pago. Si está encendido, la función de inicio exige un `provider_customer_ref` válido.
- **Proveedor**: interfaz `lib/pagos/proveedor.ts` con crear cliente, registrar medio, cobrar, cancelar y verificar
  webhook. Incluye una implementación "nula" que no cobra. **Nunca se guardan datos de tarjeta, solo tokens del
  proveedor** (PCI DSS).
- **Documentación**: `docs/COBROS.md`, con los requisitos de L7.

## 6. Plan por etapas (Fase 2)

Cada etapa: un commit, con lint, tipos y build antes; actualización de `PROGRESO.md` y `CUMPLIMIENTO_LEGAL.md`. Las
etapas marcadas 🗄️ incluyen una migración nueva que te muestro antes de aplicar.

| # | Etapa | Contenido | Depende de |
|---|---|---|---|
| 0 | **Destrabar** | Decidir la migración 6, fusionar el PR #1 y confirmar la rama de despliegue. | Tú |
| 1 | **Encuadre legal en la interfaz** | Textos sin lenguaje de contratación; avisos y casillas antes de publicar y postular; borradores de `/terminos`, `/privacidad` y `/aviso-legal`; pie legal; 404 y 500. | — |
| 2 | 🗄️ **Encuadre en la base** | Congelar ofertas, contrataciones, cambios, cierre, boletas y comisión (revocar `EXECUTE`, sin borrar); "contactar" en lugar de oferta; `terms_version`. | Tu decisión sobre L1 |
| 3 | 🗄️ **Lectura pública y SEO** | `get_public_job`; corregir T4 y T10; detalle público; `sitemap`, `robots`, Open Graph y `JobPosting`. | — |
| 4 | **Lado empresa** | Mis publicaciones, postulantes, contactar o descartar, cancelar. | 2 |
| 5 | **Portada** | Dos caminos; registro con el tipo elegido; buscador de ejemplo marcado "demostración"; cómo funciona; beneficios; confianza; preguntas frecuentes; banner de prueba controlado por el interruptor. | 1 |
| 6 | 🗄️ **Billetera de documentos** | §4 completo, con pgTAP. | 2 |
| 7 | 🗄️ **Prueba gratis y suscripción** | §5 completo, apagado, con pgTAP y `docs/COBROS.md`. | Tu OK sobre el cambio de `subscriptions` |
| 8 | **Seguridad** | CSP, límites de intentos, captcha, `public_flags()`, integración continua, `docs/OPERACION.md`. | — |
| 9 | 🗄️ **Moderación y confianza** | Reportes, detector de avisos discriminatorios o fraudulentos, panel `/admin` mínimo, verificación de empresas. | 2 |
| 10 | **Perfil y notificaciones** | Perfil del trabajador, postular con un toque, bandeja de notificaciones, correos en español. | 6 |
| 11 | **Datos personales** | "Mis datos": ver, corregir, exportar y eliminar; `docs/TRATAMIENTOS.md`; procedimiento de brechas. | 6 |
| 12 | **Pulido** | Modo oscuro (con el logo), PWA sin conexión, i18n, mediciones de Lighthouse. | Logo oscuro |

## 7. Decisiones que necesito de ti
1. **Migración 6**: ¿la aplicamos (te muestro el SQL) o la sacamos del PR?
2. **Encuadre L1**: ¿congelamos ofertas, contrataciones, boletas y comisión, y pasamos a "contactar"?
3. **`subscriptions`**: ¿autorizas la conversión de estados (§5)?
4. **Malware**: ¿escaneo con costo ahora, o "no escaneado" con validación estricta por el momento?
5. **Logo para fondo oscuro**: ¿lo tienes, o preparo una propuesta para tu aprobación?
6. **Retención de documentos**: ¿aceptas los plazos propuestos en §4 como borrador para el abogado?

## Puntos para el abogado (resumen)
- **L1 y L8:** el modelo "medio de difusión", la EST y la Ley 21.431.
- **L2 y L3:** el texto de los términos, la privacidad y los avisos.
- **L4:** la vigencia de la Ley 21.719 y la base de licitud.
- **L5:** la responsabilidad del medio por avisos discriminatorios.
- **L6:** los antecedentes penales (qué cargos califican, si se custodian o solo se comparten, y su retención).
- **L7:** el cobro recurrente, la prueba gratis y el término del contrato según la Ley 19.496 y la Ley 21.398.
- **L9:** la redacción del cuestionario de modalidad.
- **P7:** el tratamiento del RUT de las empresas para verificarlas.

## Fuentes consultadas
- Ley 21.719, vigencia: [Diario Constitucional](https://www.diarioconstitucional.cl/2026/06/12/la-ley-21-719-entra-en-vigor-el-1-de-diciembre-y-expone-vacios-en-regulacion-de-pequenas-empresas/), [Academia Judicial](https://academiajudicial.cl/recursos/actualizaciones-normativas/ley-21-719-que-regula-la-proteccion-y-el-tratamiento-de-los-datos-personales-y-crea-la-agencia-de-proteccion-de-datos-personales/), [ODECU (PDF)](https://odecu.cl/wp-content/uploads/2025/11/DOCUMENTO-DE-TRABAJO-7proteccion-de-datos-personales.pdf); proyecto de postergación: [Ecosistema Startup](https://ecosistemastartup.com/?p=104145).
- Antecedentes y no discriminación: [Dirección del Trabajo](https://dt.gob.cl/portal/1628/w3-article-60778.html), [Diario Constitucional (Dictamen 541/24)](https://www.diarioconstitucional.cl/2025/08/19/no-discriminacion-empleadores-no-pueden-usar-antecedentes-medicos-financieros-o-judiciales-salvo-que-afecten-la-idoneidad-para-el-puesto/), [Prieto Abogados](https://www.prieto.cl/en-el-marco-del-tratamiento-de-datos-personales-direccion-del-trabajo-establece-que-certificado-de-antecedentes-laborales-vulnera-el-derecho-a-la-no-discriminacion/).
- Avisos discriminatorios (art. 2 del Código del Trabajo): [DT, art. 95023](https://dt.gob.cl/portal/1628/w3-article-95023.html), [DT, art. 85019](https://dt.gob.cl/portal/1627/w3-article-85019.html), [iura.cl, art. 2](https://iura.cl/ct/2).
- Ley 21.431: [Carey](https://www.carey.cl/api/archivo/entra-en-vigencia-ley-que-regula-el-contrato-de-trabajadores-plataformas-digitales-de-servicios?lang=es), [Actualidad Jurídica (dictamen DT 1.831/39)](https://actualidadjuridica.doe.cl/?p=9416), [BCN, historia de la ley](https://www.bcn.cl/historiadelaley/historia-de-la-ley/vista-expandida/7981/).
- Ley 21.398 (fuente secundaria, **a confirmar**): [blog sobre suscripciones en Chile](https://blog.iambeezy.app/es/suscripciones-renovacion-automatica-cancelar-chile-2026/), [SERNAC](https://www.sernac.cl/604/w3-article-771.html).
- JobPosting: [Google Search Central](https://developers.google.com/search/docs/appearance/structured-data/job-posting). Las fuentes secundarias no coinciden sobre qué propiedades son obligatorias, así que hay que verificar en la página oficial al implementar.
- Competencia: [Chilevisión, plataformas de empleo](https://www.chilevision.cl/noticias/te-ayuda/estas-cesante-estas-son-las-7-plataformas-que-debes-conocer-para-encontrar-trabajo-en-chile/), [Cazvid, guía 2026](https://cazvid.com/es/blog/donde-publicar-empleos-gratis).
