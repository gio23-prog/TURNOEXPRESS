# Verificaciones legales y tributarias pendientes

> Este documento **no es asesoría legal**. Identifica normas y riesgos que un abogado laboralista y un contador o tributarista deben revisar antes del lanzamiento. Lo marcado "a confirmar" proviene de conocimiento general y no ha sido verificado contra la fuente oficial vigente.

## A. Prioridad crítica (antes de operar con usuarios reales)

**1. Naturaleza de la relación: honorarios vs. contrato de trabajo.** El Código del Trabajo presume relación laboral cuando hay servicios personales bajo subordinación y dependencia a cambio de remuneración. Turnos con horario impuesto, supervisión directa e instrucciones continuas (garzón, cajero, reponedor) tienen alto riesgo de ser calificados como laborales aunque se pague con boleta. La plataforma ya incorpora un cuestionario obligatorio que activa advertencias y revisión, pero **no determina** la calificación. Preguntas para el abogado: ¿qué categorías pueden operar realmente como prestación independiente? ¿Qué responsabilidad tiene la plataforma si una empresa usa honorarios para una relación laboral?

**2. Empresas de Servicios Transitorios (EST).** El Código del Trabajo regula el suministro de trabajadores a empresas usuarias para, entre otros casos, reemplazar trabajadores ausentes y cubrir aumentos ocasionales de actividad (a confirmar: arts. 183-F y siguientes, introducidos por la Ley 20.123). Ese es casi exactamente el caso de uso principal. Las EST deben registrarse en la Dirección del Trabajo y constituir garantía. Preguntas: ¿la plataforma podría ser calificada como EST o como suministro ilegal? ¿Conviene operar en alianza con una EST registrada para los turnos subordinados?

**3. Ley de trabajadores de plataformas digitales.** La Ley 21.431 (2022) regula a trabajadores de empresas de plataformas digitales de servicios, dependientes e independientes (a confirmar alcance exacto). Pregunta: ¿TurnoExpress cae en la definición de "empresa de plataforma digital de servicios"? Si sí, hay obligaciones de contrato, información, protección de datos y seguridad que afectan el diseño.

**4. Protección de datos personales.** Hoy rige la Ley 19.628. La Ley 21.719, que la reemplaza sustancialmente y crea una Agencia de Protección de Datos, tendría su entrada en vigencia en diciembre de 2026 (a confirmar fecha exacta). Coincide con el lanzamiento: diseñar ya conforme a la nueva ley (bases de licitud, derechos ARCO+portabilidad, registro de tratamientos, notificación de brechas, evaluación de impacto si se trata RUT y geolocalización). La plataforma ya aplica minimización, consentimiento explícito, datos sensibles separados y geolocalización opcional.

## B. Tributario

**5. Boleta de honorarios electrónica.** Se emite en sii.cl por el prestador con inicio de actividades en segunda categoría. Si el receptor es contribuyente que lleva contabilidad, en general debe retener. Tasa de retención 2026: 15,25 % según la gradualidad de la Ley 21.133 (a confirmar con el contador; sube anualmente hasta 17 % en 2028). Validar: cuándo retiene la empresa vs. cuándo paga el prestador, y el caso de clientes particulares que no retienen.

**6. Boleta de prestación de servicios de terceros.** Cuando el prestador no tiene inicio de actividades, la empresa receptora puede emitirla. El modelo de datos ya admite este tipo (`boleta_prestacion_terceros`). Validar requisitos y si conviene ofrecerlo.

**7. Comisión de la plataforma.** Si se activa el Modelo A (comisión), la plataforma prestaría un servicio afecto a IVA y debería emitir factura o boleta electrónica. Definir a quién se cobra, cómo se documenta y si la plataforma recauda dinero de terceros (lo que puede implicar regulación adicional de medios de pago).

**8. Integración con proveedores tributarios.** El sistema sólo **registra** documentos emitidos externamente (folio, fecha, monto, archivo). No emite ni simula documentos del SII. Una integración futura debe evaluarse técnica y legalmente.

## C. Contractual y operativo

**9. Términos y condiciones y política de privacidad**: redactar con abogado; deben explicar el rol de intermediación, sin cláusulas que intenten renunciar a derechos laborales irrenunciables.
**10. Responsabilidad de la plataforma**: accidentes durante el servicio (seguro de accidentes del trabajo para independientes que cotizan vía declaración anual, a confirmar), daños, no presentación, fraude.
**11. Protección al consumidor**: si particulares contratan servicios, revisar la Ley 19.496 para los términos aplicables a ellos.
**12. Oficios regulados**: instalaciones eléctricas o de gas exigen autorización SEC; la subcategoría "Apoyo en instalaciones" ya lo advierte, pero debe definirse si se permite.
**13. Remuneraciones mínimas**: el sistema no inventa un mínimo por modalidad. Si un turno se ejecuta como relación laboral, aplica el ingreso mínimo mensual proporcional; el abogado debe validar las advertencias de tarifa que mostrará la interfaz.
**14. Edad mínima**: el registro debe exigir mayoría de edad (o reglas específicas para mayores de 15 con autorización, a confirmar). Decidir y aplicar en la Etapa 2.

## D. Estado de implementación (ver docs/AUDITORIA.md)

**Posicionamiento decidido (09/10/2026):** Turnoexpress opera como **medio de difusión** de ofertas, al estilo de un portal de empleo. No es empleador, no contrata, no paga ni garantiza empleo.

| Punto | Estado |
|---|---|
| Aviso de medio de difusión en interfaz, antes de publicar y de postular | ✅ Etapa 1 (validado también en servidor) |
| Términos, privacidad y aviso legal | 🟡 Borradores publicados y marcados "pendiente de revisión legal". Faltan responsable, RUT, contacto y proveedores. |
| Versión aceptada de los documentos | ⏳ Etapa 2 (`terms_version`) |
| Congelar ofertas, contrataciones, boletas y comisión; pasar a "contactar" | ⏳ Etapa 2 (autorizado) |
| Mayoría de edad (migración 6) | ⏳ Autorizado aplicarla en Supabase |
| Documentos del trabajador (antecedentes solo con justificación, sin filtro automático) | ⏳ Etapa 6. Sin escaneo de malware pagado: validación estricta de tipo y tamaño. |
| Retención de documentos | 🟡 Plazos de docs/AUDITORIA.md §4 aceptados como borrador para el abogado |
| Cobro recurrente y prueba gratis | ⏳ Etapa 7 (apagado, sin interfaz) |
