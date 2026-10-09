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

## Cobertura nacional ✅ (09/10/2026)
- Migración 6: las 16 regiones (ordenadas norte → sur) y las 346 comunas de Chile, todas activas. Probada en PostgreSQL 16; las 81 pruebas siguen pasando.
- Formulario de publicación: se elige región y luego comuna.
- Pendiente: coordenadas por comuna para el filtro "cerca de mí".

## Portada y buscador ✅ (09/10/2026)
- Portada de TurnoExpress con accesos según sesión y cierre de sesión.
- /trabajos: búsqueda con filtros (región, comuna, rubro, fecha, pago mínimo por hora, texto), atajos (hoy, mañana, fin de semana, pocas horas, jornada completa), orden y paginación. Usa la RPC search_jobs.
- /trabajos/[id]: detalle del turno (sin dirección exacta), estado de la postulación propia, aviso de cruce de horario, postular y retirar postulación (RPC apply_to_job / withdraw_application).
- Al postular por primera vez se crea un perfil profesional mínimo (nombre + inicial del apellido). Falta la pantalla de perfil completo.

## Datos de empresa y preguntas del empleador ✅ (09/10/2026)
- Migración 7: RUT, razón social, giro, dirección fiscal, representante legal (nombre y RUT) y persona a cargo. La base impide publicar si falta algo.
- /empresa/perfil: formulario con validación de RUT (módulo 11). Registro de empresa → completar datos → publicar.
- Preguntas del empleador (hasta 5 por turno): Sí/No, opciones o respuesta corta; obligatorias u opcionales; respuestas excluyentes ocultas para el trabajador. Quien responde una excluyente queda marcado (applications.disqualified), sin rechazo automático.
- Aviso al redactar preguntas sobre temas que no se deben preguntar (edad, embarazo, religión, salud, etc.).
- 102 pruebas de base de datos pasando (21 nuevas).
- Pendiente: panel de empresa para ver postulantes y sus respuestas.

## Registro de empresa en un paso ✅ (09/10/2026)
- Migración 8: sector, n° de trabajadores (tramos Ley 20.416) y turnos estimados al mes; RUT de empresa único sin importar el formato; rut_empresa_disponible().
- /registro → "Necesito personal": un solo formulario con cuenta (persona a cargo), empresa, dirección fiscal y representante legal ("Yo soy el representante legal"). Al terminar entra directo a publicar.
- Los datos legales no se guardan en los metadatos de la cuenta; si Supabase exige confirmar el correo, se completan al primer ingreso.
- 108 pruebas de base de datos pasando.

## Tipo de contrato y normas de publicación ✅ (09/10/2026)
- Migración 9: preguntas del empleador de hasta 500 caracteres.
- Migración 10: tipo de contrato (plazo fijo, por obra o faena, indefinido, boleta de honorarios).
  · Contrato de trabajo → se publica sin cuestionario ni revisión.
  · Boleta de honorarios → cuestionario de 5 preguntas; 3+ indicios → revisión.
  · Pago por hora sobre $40.000 → revisión.
- Normas de publicación (inspiradas en Computrabajo), aplicadas en la base y avisadas en el formulario:
  sin datos de contacto, sin cobros al trabajador, sin multinivel, sin pago solo por comisión,
  sin requisitos discriminatorios, sin títulos en mayúsculas ni genéricos. Un puesto y una ubicación por publicación (por diseño).
- La empresa ve el motivo cuando su turno queda en revisión; el trabajador ve el tipo de contratación en el detalle.
- 130 pruebas de base de datos pasando.

## Guía de contratación en el formulario ✅ (09/10/2026)
- Cada pregunta de modalidad tiene una ayuda con ejemplos de "Sí" y "No".
- Con 2 o más indicios, el formulario sugiere cambiar a contrato por obra o faena o a plazo fijo (un clic; se publica sin revisión).
- Con boleta de honorarios se exige declarar que las respuestas describen cómo se hará realmente el trabajo.
- Criterio: el formulario guía al contrato correcto; no induce respuestas para evitar la revisión.

## Condiciones del empleador ✅ (09/10/2026)
- Migración 11: cada turno guarda la versión y fecha de las condiciones aceptadas; la base no publica sin aceptación.
- Texto en lib/condiciones.ts (BORRADOR para revisión legal): compromisos comunes + específicos para contrato de trabajo u honorarios.
- 134 pruebas de base de datos pasando.
- Pendiente de decisión: honorarios con 3+ indicios → ¿revisión antes de publicar (actual) o publicar y revisar después?

## Revisión solo cuando hace falta + documentos legales ✅ (09/10/2026)
- Migración 12: honorarios con 3+ indicios se publica de inmediato y queda marcado para revisión posterior (followup_*). Revisión previa solo por pago por hora inusualmente alto. Lo grave (discriminación, contacto, cobros, multinivel) se bloquea al instante.
- Una sola casilla al publicar: las condiciones del empleador incluyen veracidad y, si corresponde, el aviso de indicios.
- Trabajador ve aviso de derechos en turnos con boleta de honorarios.
- /legal/terminos y /legal/privacidad: textos propios (no copiados) para Chile, enlazados en el pie y en el registro. Datos del operador en lib/operador.ts (COMPLETAR).
- 136 pruebas de base de datos pasando.

## Sin revisión por monto ✅ (09/10/2026)
- Migración 13: la revisión por "pago por hora alto" queda desactivada (platform_settings.max_hourly_review_clp = 0) y es configurable.
- El pago sigue debiendo ser mayor a $0 (no se permite trabajo sin pago).
- 141 pruebas de base de datos pasando.

## Estado de postulaciones (trabajador y empresa) ✅ (09/10/2026)
- Migración 14: job_applicant_counts() para mostrar cuántos postularon.
- /trabajador/postulaciones: pestañas (Todas, En proceso, Confirmadas, Finalizadas, No seleccionadas), estado, tiempo y anillo de avance.
- Detalle del turno: línea de estado (Postulado → Perfil visto → Preseleccionado → Oferta recibida → Turno confirmado → Finalizado), aceptar/rechazar oferta y dirección al confirmar.
- /empresa/publicaciones y /empresa/publicaciones/[id]: turnos con conteos; postulantes con respuestas, "No cumple requisito", preseleccionar, descartar y enviar oferta. Al abrir la lista, los nuevos pasan a "Perfil visto".
- Encabezado según rol. 143 pruebas de base de datos pasando.
- Pendiente: finalización del servicio, evaluaciones y boletas en pantalla; panel de administración.

## Registro del trabajador, currículum y compromiso de asistencia ✅ (09/10/2026)
- Migración 15: datos personales privados (worker_private: dirección y comuna), RUT único, CV en PDF (bucket privado "curriculums", 5 MB), cada postulación guarda el CV enviado, versión del compromiso de asistencia en bookings, tablas y funciones de inasistencia (report_no_show, descargo, reactivación por administrador).
- Registro del trabajador: nombre completo, correo, contraseña, teléfono, RUT, región/comuna y dirección → sube su CV → completa su perfil.
- /trabajador/perfil en 3 pasos (Datos personales, Currículum, Perfil: nombre visible, sobre ti, experiencia, años, boleta, rubros y comunas).
- Para postular a un turno se exige datos personales y CV; la empresa ve "Ver currículum (PDF)" en cada postulante (enlace temporal de 60 s).
- Al aceptar un turno, el trabajador acepta el compromiso de asistencia (suspensión automática de 48 h si no se presenta sin cancelar). Cláusula agregada a los Términos.
- Al ingresar, un trabajador con perfil incompleto va directo a /trabajador/perfil.
- 168 pruebas de base de datos pasando.
- En pausa (esperando decisión): pantallas para informar inasistencia, aviso de suspensión/descargo y panel de reactivación.
