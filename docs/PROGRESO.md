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
