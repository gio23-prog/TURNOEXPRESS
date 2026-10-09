-- Pruebas de flujos críticos y aislamiento de datos.
-- Ejecutar: supabase test db   (o localmente: scripts/test-db-local.sh)
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
-- Estas pruebas no tratan sobre las condiciones del empleador (ver 05): se dan por aceptadas.
alter table public.job_posts alter column employer_terms_version set default 'test',
                             alter column employer_terms_accepted_at set default now();

-- ============================================================ Registro
select throws_like(
  $$ insert into auth.users (id, email, raw_user_meta_data) values
     (gen_random_uuid(), 'x@test.cl', '{"role":"empresa","full_name":"X"}') $$,
  '%términos%', 'Registro sin consentimiento es rechazado');
select throws_like(
  $$ insert into auth.users (id, email, raw_user_meta_data) values
     (gen_random_uuid(), 'y@test.cl', '{"role":"admin","accepted_terms":true,"accepted_privacy":true}') $$,
  '%Tipo de cuenta inválido%', 'No se puede auto-registrar como administrador');

insert into auth.users (id, email, raw_user_meta_data) values
 ('b0000000-0000-0000-0000-000000000001','b1@test.cl','{"role":"empresa","full_name":"Ana Empresa","accepted_terms":true,"accepted_privacy":true}'),
 ('b0000000-0000-0000-0000-000000000002','b2@test.cl','{"role":"empresa","full_name":"Beto Empresa","accepted_terms":true,"accepted_privacy":true}'),
 ('a0000000-0000-0000-0000-000000000001','w1@test.cl','{"role":"trabajador","full_name":"Carla Trabajadora","accepted_terms":true,"accepted_privacy":true}'),
 ('a0000000-0000-0000-0000-000000000002','w2@test.cl','{"role":"trabajador","full_name":"Diego Trabajador","accepted_terms":true,"accepted_privacy":true}'),
 ('ad000000-0000-0000-0000-000000000001','admin@test.cl','{"role":"trabajador","full_name":"Admin","accepted_terms":true,"accepted_privacy":true}');
insert into admin_roles (user_id, level) values ('ad000000-0000-0000-0000-000000000001','superadmin');
select is((select count(*)::int from profiles), 5, 'Se crean perfiles al registrarse');

select ok(rut_is_valid('11.111.111-1'), 'RUT válido aceptado');
select ok(not rut_is_valid('11.111.111-2'), 'RUT con DV incorrecto rechazado');

-- Fechas base: mañana 18:00–24:00 hora de Chile
select set_config('t.start', (((now() at time zone 'America/Santiago')::date + 1 + time '18:00') at time zone 'America/Santiago')::text, true);

-- ============================================================ Empresa 1
set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
select throws_like($$ insert into business_profiles (user_id, trade_name) values (auth.uid(), 'Falso') $$,
  '%perfil de negocio%', 'Un trabajador no puede crear perfil de empresa');

set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000001';
select lives_ok($$ insert into business_profiles (user_id, trade_name, rut, comuna_id, legal_name, giro, fiscal_address,
    legal_rep_name, legal_rep_rut, contact_name, contact_phone)
  values (auth.uid(), 'Restaurante La Prueba', '76.086.428-5', (select id from comunas where name = 'Providencia'),
    'Restaurante La Prueba SpA', 'Restaurantes', 'Av. Providencia 1234', 'Ana Empresa', '11.111.111-1', 'Ana Empresa', '+56912345678') $$,
  'La empresa crea su perfil');
select throws_like($$ update business_profiles set verification_status = 'verificado' where user_id = auth.uid() $$,
  '%permission denied%', 'La empresa no puede autoverificarse');

with x as (
  insert into job_posts (business_id, title, category_id, description, starts_at, ends_at, comuna_id,
                         pay_type, pay_amount_clp, engagement_mode)
  values (auth.uid(), 'Garzón reemplazo hoy', (select id from categories where slug = 'garzon'),
          'Atención de mesas en turno de noche por ausencia imprevista.',
          current_setting('t.start')::timestamptz, current_setting('t.start')::timestamptz + interval '6 hours',
          (select id from comunas where name = 'Providencia'), 'total', 30000, 'prestacion_independiente')
  returning id)
select set_config('t.job1', id::text, true) from x;
select is((select hourly_equivalent_clp from job_posts where id = current_setting('t.job1')::uuid), 5000,
  'Calcula el valor hora equivalente (30.000 / 6 h)');
select is((select status::text from job_posts where id = current_setting('t.job1')::uuid), 'borrador', 'Se crea como borrador');

select throws_ok($$ insert into job_posts (business_id, title, category_id, description, starts_at, ends_at, comuna_id, pay_type, pay_amount_clp)
  values (auth.uid(), 'Horario malo', 1, 'Descripción suficientemente larga para pasar.', now() + interval '2 days',
          now() + interval '1 day', 1, 'total', 10000) $$, '23514', null, 'Rechaza término anterior al inicio');
select throws_ok($$ insert into job_posts (business_id, title, category_id, description, starts_at, ends_at, comuna_id, pay_type, pay_amount_clp)
  values (auth.uid(), 'Pago cero', 1, 'Descripción suficientemente larga para pasar.', now() + interval '1 day',
          now() + interval '1 day 2 hours', 1, 'total', 0) $$, '23514', null, 'Rechaza tarifa no positiva');
select throws_ok($$ update job_posts set status = 'publicada' where id = current_setting('t.job1')::uuid $$,
  '42501', null, 'El estado no se puede cambiar directamente');

select throws_like($$ select publish_job(current_setting('t.job1')::uuid) $$, '%dirección%', 'Exige dirección para publicar');
insert into job_post_private (job_id, address_line) values (current_setting('t.job1')::uuid, 'Av. Providencia 1234');
select throws_like($$ select publish_job(current_setting('t.job1')::uuid) $$, '%modalidad de prestación%',
  'Exige responder el cuestionario de modalidad');
update job_posts set q_autonomy = true, q_direct_supervision = false, q_imposed_schedule = true,
       q_continuous_instructions = false, q_core_recurring = false where id = current_setting('t.job1')::uuid;
select is((select labor_risk::text from job_posts where id = current_setting('t.job1')::uuid), 'bajo', 'Riesgo orientativo bajo');
select is(publish_job(current_setting('t.job1')::uuid)::text, 'publicada', 'Publicación de riesgo bajo queda publicada');

-- Publicación con indicadores de relación laboral declarada como independiente -> revisión
with x as (
  insert into job_posts (business_id, title, category_id, description, starts_at, ends_at, comuna_id, pay_type, pay_amount_clp,
                         engagement_mode, q_autonomy, q_direct_supervision, q_imposed_schedule, q_continuous_instructions, q_core_recurring)
  values (auth.uid(), 'Cajero turno largo', (select id from categories where slug = 'cajero'),
          'Caja con supervisión directa del jefe de local todo el turno.',
          current_setting('t.start')::timestamptz + interval '2 days', current_setting('t.start')::timestamptz + interval '2 days 8 hours',
          (select id from comunas where name = 'Santiago'), 'por_hora', 45000, 'prestacion_independiente', false, true, true, true, false)
  returning id)
select set_config('t.job2', id::text, true) from x;
insert into job_post_private (job_id, address_line) values (current_setting('t.job2')::uuid, 'Huérfanos 1000');
select throws_like($$ select publish_job(current_setting('t.job2')::uuid) $$, '%advertencia%', 'Riesgo alto exige confirmar advertencia');
update job_posts set labor_warning_ack_at = now() where id = current_setting('t.job2')::uuid;
reset role;
update platform_settings set value = '20000' where key = 'max_hourly_review_clp';  -- se activa solo para esta prueba
set local role authenticated;
select is(publish_job(current_setting('t.job2')::uuid)::text, 'en_revision', 'Con tope activado, pago por hora muy alto pasa a revisión');

-- ============================================================ Trabajadores
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
select is((select count(*)::int from job_posts where id = current_setting('t.job2')::uuid), 0, 'Trabajador no ve publicaciones en revisión');
select throws_like($$ select apply_to_job(current_setting('t.job1')::uuid, true) $$, '%Completa tu perfil%', 'Exige perfil para postular');
insert into worker_profiles (user_id, display_name, can_issue_boleta) values (auth.uid(), 'Carla T.', true);
-- Datos personales y CV (requeridos para postular desde la migración 15)
update profiles set phone = '+56912345678', rut = '5.126.663-3' where id = auth.uid();
insert into worker_private (user_id, address_line, comuna_id) values (auth.uid(), 'Pasaje Uno 123', (select id from comunas where name = 'Santiago'));
update worker_profiles set cv_path = auth.uid()::text || '/cv-1.pdf' where user_id = auth.uid();
select is((select count(*)::int from search_jobs(p_quick => 'manana') where id = current_setting('t.job1')::uuid), 1,
  'El buscador encuentra el turno de mañana');
select is((select count(*)::int from search_jobs(p_category => (select id from categories where slug = 'gastronomia'))
           where id = current_setting('t.job1')::uuid), 1, 'Filtrar por categoría padre incluye subcategorías');
select is((select count(*)::int from search_jobs(p_comunas => array[(select id from comunas where name = 'Maipú')])), 0,
  'Filtro por comuna excluye otras comunas');
select is((select count(*)::int from job_post_private where job_id = current_setting('t.job1')::uuid), 0,
  'La dirección exacta no es visible antes de contratar');
select throws_like($$ select apply_to_job(current_setting('t.job1')::uuid, false) $$, '%disponibilidad%', 'Exige confirmar disponibilidad');
select set_config('t.app1', apply_to_job(current_setting('t.job1')::uuid, true, 'Tengo 3 años de experiencia')::text, true);
select throws_like($$ select apply_to_job(current_setting('t.job1')::uuid, true) $$, '%Ya postulaste%', 'Evita postulaciones duplicadas');

set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
insert into worker_profiles (user_id, display_name, is_public) values (auth.uid(), 'Diego', false);
-- Datos personales y CV (requeridos para postular desde la migración 15)
update profiles set phone = '+56912345678', rut = '6.000.000-K' where id = auth.uid();
insert into worker_private (user_id, address_line, comuna_id) values (auth.uid(), 'Pasaje Uno 123', (select id from comunas where name = 'Santiago'));
update worker_profiles set cv_path = auth.uid()::text || '/cv-1.pdf' where user_id = auth.uid();
select set_config('t.app2', apply_to_job(current_setting('t.job1')::uuid, true)::text, true);
select is((select count(*)::int from applications where worker_id = 'a0000000-0000-0000-0000-000000000001'), 0,
  'Un trabajador no ve postulaciones de otro');
select is((select count(*)::int from profiles where id = 'a0000000-0000-0000-0000-000000000001'), 0,
  'Un trabajador no ve datos personales de otro');
select is((select count(*)::int from business_profiles), 0, 'El RUT y contacto de empresas no son públicos');
select is((select count(*)::int from v_public_businesses where user_id = 'b0000000-0000-0000-0000-000000000001'), 1,
  'La vista pública de la empresa sí es visible');

-- ============================================================ Empresa 2 (ajena)
reset role;
insert into business_profiles (user_id, trade_name, comuna_id, rut, legal_name, giro, fiscal_address,
    legal_rep_name, legal_rep_rut, contact_name, contact_phone) values
  ('b0000000-0000-0000-0000-000000000002', 'Eventos Otro', (select id from comunas where name = 'Ñuñoa'), '77.777.777-7',
   'Eventos Otro Ltda', 'Producción de eventos', 'Irarrázaval 3000', 'Beto Empresa', '22.222.222-2', 'Beto Empresa', '+56987654321');
set local role authenticated;
set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000002';
select is((select count(*)::int from applications where job_id = current_setting('t.job1')::uuid), 0,
  'Otra empresa no ve postulaciones ajenas');
select is((select count(*)::int from worker_profiles where user_id = 'a0000000-0000-0000-0000-000000000002'), 0,
  'Perfil privado no es visible para empresas sin relación');
select throws_like($$ select send_offer(current_setting('t.app1')::uuid) $$, '%no encontrada%', 'Otra empresa no puede ofertar');

-- ============================================================ Selección y oferta
set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000001';
select is((select count(*)::int from applications where job_id = current_setting('t.job1')::uuid), 2, 'La empresa ve sus postulantes');
select is((select count(*)::int from worker_profiles where user_id = 'a0000000-0000-0000-0000-000000000002'), 1,
  'La empresa ve el perfil privado de quien le postuló');
select lives_ok($$ select set_application_status(current_setting('t.app1')::uuid, 'preseleccionada') $$, 'Preselecciona');
select throws_like($$ select set_application_status(current_setting('t.app1')::uuid, 'aceptada') $$, '%no permitido%',
  'Transición de estado inválida rechazada');
select is((select count(*)::int from conversations where application_id = current_setting('t.app1')::uuid), 1,
  'La preselección habilita la mensajería');
select set_config('t.conv1', (select id::text from conversations where application_id = current_setting('t.app1')::uuid), true);
select set_config('t.offer1', send_offer(current_setting('t.app1')::uuid, 'Te esperamos 17:45')::text, true);
select throws_like($$ select send_offer(current_setting('t.app2')::uuid) $$, '%cupos%', 'No permite ofertar más que los cupos');

set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
select throws_like($$ select respond_offer(current_setting('t.offer1')::uuid, true, false, null, 'test') $$, '%disponibilidad%',
  'Aceptar exige confirmar disponibilidad');
select set_config('t.book1', respond_offer(current_setting('t.offer1')::uuid, true, true, null, 'test')::text, true);
select is((select status::text from bookings where id = current_setting('t.book1')::uuid), 'confirmada', 'Contratación confirmada');
select is((select terms_snapshot->>'monto_clp' from bookings where id = current_setting('t.book1')::uuid), '30000',
  'Se guarda el resumen de condiciones');
select is((select count(*)::int from job_post_private where job_id = current_setting('t.job1')::uuid), 1,
  'Con contratación activa, el trabajador ve la dirección');
select lives_ok($$ insert into messages (conversation_id, body)
  select id, 'Hola, llego a las 17:45' from conversations where application_id = current_setting('t.app1')::uuid $$,
  'Las partes pueden enviarse mensajes');

reset role;
select is((select status::text from job_posts where id = current_setting('t.job1')::uuid), 'cubierta', 'La publicación queda cubierta');
set local role authenticated;

set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
select throws_like($$ insert into messages (conversation_id, body) values (current_setting('t.conv1')::uuid, 'intruso') $$,
  '%row-level security%', 'Un tercero no puede escribir en la conversación');
select is((select count(*)::int from messages), 0, 'Un tercero no puede leer la conversación');

-- ============================================================ Superposición de horarios
set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000002';
with x as (
  insert into job_posts (business_id, title, category_id, description, starts_at, ends_at, comuna_id, pay_type, pay_amount_clp,
                         q_autonomy, q_direct_supervision, q_imposed_schedule, q_continuous_instructions, q_core_recurring)
  values (auth.uid(), 'Promotora evento', (select id from categories where slug = 'promotor'),
          'Promoción de producto en evento con material entregado.',
          current_setting('t.start')::timestamptz + interval '2 hours', current_setting('t.start')::timestamptz + interval '5 hours',
          (select id from comunas where name = 'Ñuñoa'), 'total', 25000, true, false, false, false, false)
  returning id)
select set_config('t.job3', id::text, true) from x;
insert into job_post_private (job_id, address_line) values (current_setting('t.job3')::uuid, 'Irarrázaval 3000');
select publish_job(current_setting('t.job3')::uuid);
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
select set_config('t.app3', apply_to_job(current_setting('t.job3')::uuid, true)::text, true);
select is((select count(*)::int from my_overlapping_bookings(current_setting('t.job3')::uuid)), 1,
  'Detecta superposición para advertir en la interfaz');
set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000002';
select set_config('t.offer3', send_offer(current_setting('t.app3')::uuid)::text, true);
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
select throws_like($$ select respond_offer(current_setting('t.offer3')::uuid, true, true, null, 'test') $$, '%se superpone%',
  'Bloquea contrataciones con horarios superpuestos');
select lives_ok($$ select set_config('t.book3', respond_offer(current_setting('t.offer3')::uuid, true, true,
  'El evento es en el mismo local y la empresa 1 lo autorizó por escrito', 'test')::text, true) $$,
  'Permite superposición con justificación explícita');

-- Cancelación con registro
set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000002';
select throws_like($$ select cancel_booking(current_setting('t.book3')::uuid, '') $$, '%motivo%', 'Cancelar exige motivo');
select lives_ok($$ select cancel_booking(current_setting('t.book3')::uuid, 'Se suspendió el evento') $$, 'La empresa cancela');
select is((select cancelled_by::text from bookings where id = current_setting('t.book3')::uuid),
  'b0000000-0000-0000-0000-000000000002', 'La cancelación registra quién la hizo');
select is((select count(*)::int from booking_status_history where booking_id = current_setting('t.book3')::uuid), 2,
  'El historial registra creación y cancelación');

-- ============================================================ Finalización y evaluaciones
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
select throws_like($$ select submit_review(current_setting('t.book1')::uuid, 5) $$, '%finalizados%',
  'No se puede evaluar antes de finalizar');
select throws_like($$ select confirm_completion(current_setting('t.book1')::uuid) $$, '%antes del inicio%',
  'No se puede finalizar antes del inicio');

reset role;  -- simula el paso del tiempo
update bookings set starts_at = now() - interval '7 hours', ends_at = now() - interval '1 hour'
 where id = current_setting('t.book1')::uuid;
set local role authenticated;

set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
select is(confirm_completion(current_setting('t.book1')::uuid)::text, 'en_curso', 'Confirmación de una parte');
set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000001';
select is(confirm_completion(current_setting('t.book1')::uuid)::text, 'finalizada', 'Con ambas confirmaciones queda finalizada');
select is((select count(*)::int from booking_status_history where booking_id = current_setting('t.book1')::uuid), 3,
  'Historial: confirmada → en_curso → finalizada');
select lives_ok($$ select submit_review(current_setting('t.book1')::uuid, 5, 'Excelente') $$, 'La empresa evalúa');
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
select lives_ok($$ select submit_review(current_setting('t.book1')::uuid, 4) $$, 'El trabajador evalúa');
select throws_like($$ select submit_review(current_setting('t.book1')::uuid, 3) $$, '%Ya evaluaste%', 'Una sola evaluación por parte');
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
select throws_like($$ select submit_review(current_setting('t.book1')::uuid, 1) $$, '%no encontrada%',
  'Quien no participó no puede evaluar');

-- ============================================================ Documento tributario
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
select throws_like($$ select register_tax_document(current_setting('t.book1')::uuid, 'emitido') $$, '%folio%',
  'No se marca como emitido sin folio y fecha');
select lives_ok($$ select register_tax_document(current_setting('t.book1')::uuid, 'emitido', '1234',
  (now() at time zone 'America/Santiago')::date, 30000) $$, 'Registra boleta emitida externamente');
select throws_like($$ select register_tax_document(current_setting('t.book1')::uuid, 'revisado', '1234', current_date) $$,
  '%Sólo la empresa%', 'El prestador no puede marcar como revisado');
set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000002';
select is((select count(*)::int from tax_documents), 0, 'Terceros no ven documentos tributarios');
set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000001';
select lives_ok($$ select mark_tax_document_reviewed((select id from tax_documents where booking_id = current_setting('t.book1')::uuid)) $$,
  'La empresa marca el documento como revisado');

-- ============================================================ Escalamiento de privilegios
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
select throws_ok($$ insert into admin_roles (user_id, level) values (auth.uid(), 'superadmin') $$, '42501', null,
  'No se puede autoasignar rol de administrador');
select throws_ok($$ update profiles set is_blocked = false where id = auth.uid() $$, '42501', null,
  'No se puede modificar el bloqueo propio');
select throws_ok($$ update bookings set status = 'finalizada' $$, '42501', null, 'No se puede alterar contrataciones directamente');
select throws_ok($$ select admin_suspend_job(current_setting('t.job1')::uuid, 'prueba de abuso') $$, '42501', null,
  'Funciones de administración bloqueadas para usuarios');
select is((select count(*)::int from audit_logs), 0, 'El registro de auditoría no es visible para usuarios');
select lives_ok($$ insert into reports (target_type, target_id, reason, details)
  values ('publicacion', current_setting('t.job1')::uuid, 'otro', 'Reporte de prueba con detalle suficiente') $$, 'Puede denunciar');

-- ============================================================ Administración
set local request.jwt.claim.sub = 'ad000000-0000-0000-0000-000000000001';
select lives_ok($$ select admin_review_job(current_setting('t.job2')::uuid, true, 'Revisado con la empresa: contratará vía contrato') $$,
  'El admin aprueba una publicación en revisión');
select lives_ok($$ select admin_set_user_block('a0000000-0000-0000-0000-000000000002', true, 'Reiteradas ausencias') $$,
  'El admin bloquea a un usuario');
select ok((select count(*) from audit_logs where action like 'admin.%') >= 2, 'Las acciones administrativas quedan auditadas');
select is((admin_metrics() ->> 'servicios_finalizados')::int, 1, 'Métricas reales: 1 servicio finalizado');

set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
select throws_like($$ select apply_to_job(current_setting('t.job2')::uuid, true) $$, '%suspendida%', 'Usuario bloqueado no puede operar');

reset role;
select ok(refresh_time_states() ? 'publicaciones_vencidas', 'El mantenimiento por tiempo se ejecuta');

select * from finish();
rollback;
