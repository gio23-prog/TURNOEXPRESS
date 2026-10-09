-- Pruebas de la migración 15: requisitos para postular, condición de asistencia e inasistencias.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
alter table public.job_posts alter column employer_terms_version set default 'test',
                             alter column employer_terms_accepted_at set default now();

insert into auth.users (id, email, raw_user_meta_data) values
 ('b7000000-0000-0000-0000-000000000001','emp7@test.cl','{"role":"empresa","full_name":"Empresa Siete","accepted_terms":true,"accepted_privacy":true}'),
 ('a7000000-0000-0000-0000-000000000001','tra7@test.cl','{"role":"trabajador","full_name":"Trabajador Siete","accepted_terms":true,"accepted_privacy":true}'),
 ('a7000000-0000-0000-0000-000000000002','otro7@test.cl','{"role":"trabajador","full_name":"Otro Siete","accepted_terms":true,"accepted_privacy":true}'),
 ('ad700000-0000-0000-0000-000000000001','adm7@test.cl','{"role":"trabajador","full_name":"Admin Siete","accepted_terms":true,"accepted_privacy":true}');
insert into admin_roles (user_id, level) values ('ad700000-0000-0000-0000-000000000001', 'moderador');
insert into business_profiles (user_id, trade_name, comuna_id, rut, legal_name, giro, fiscal_address, legal_rep_name, legal_rep_rut, contact_name, contact_phone)
  values ('b7000000-0000-0000-0000-000000000001', 'Siete SpA', (select id from comunas where name = 'Santiago'), '76.086.428-5', 'Siete SpA',
          'Comercio', 'Moneda 7', 'Rep', '11.111.111-1', 'Enc', '+56911112222');
insert into job_posts (id, business_id, title, category_id, description, starts_at, ends_at, comuna_id, pay_type, pay_amount_clp, contract_type, status, published_at)
  values ('c7000000-0000-0000-0000-000000000001', 'b7000000-0000-0000-0000-000000000001', 'Reponedor de bodega', (select id from categories where slug = 'reponedor'),
          'Reposición de productos en góndolas.', now() + interval '2 days', now() + interval '2 days 5 hours',
          (select id from comunas where name = 'Santiago'), 'total', 30000, 'por_obra', 'publicada', now());

set local role authenticated;
set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000001';
insert into worker_profiles (user_id, display_name) values (auth.uid(), 'Trabajador S.');

-- ============================================================ Requisitos para postular
select throws_like($$ select apply_to_job('c7000000-0000-0000-0000-000000000001', true) $$, '%currículum%', 'Exige CV para postular');
select throws_ok($$ update worker_profiles set cv_path = 'a7000000-0000-0000-0000-000000000002/cv-1.pdf' where user_id = auth.uid() $$,
  '42501', null, 'No puede usar el CV de otra persona');
update worker_profiles set cv_path = auth.uid()::text || '/cv-1.pdf' where user_id = auth.uid();
select throws_like($$ select apply_to_job('c7000000-0000-0000-0000-000000000001', true) $$, '%datos personales%', 'Exige teléfono, RUT y dirección');
update profiles set phone = '+56987654321', rut = '9.000.000-4' where id = auth.uid();
insert into worker_private (user_id, address_line, comuna_id) values (auth.uid(), 'Pasaje Siete 77', (select id from comunas where name = 'Santiago'));
select lives_ok($$ select set_config('t.app', apply_to_job('c7000000-0000-0000-0000-000000000001', true)::text, true) $$, 'Con datos completos postula');
select is((select cv_path from applications where id = current_setting('t.app')::uuid), 'a7000000-0000-0000-0000-000000000001/cv-1.pdf',
  'La postulación guarda el CV enviado');

set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000002';
select is((select count(*)::int from worker_private), 0, 'La dirección de otro trabajador no es visible');
select throws_ok($$ update profiles set rut = '9000000-4' where id = auth.uid() $$, '23505', null, 'El RUT de persona es único sin importar el formato');

-- ============================================================ Condición de asistencia
set local request.jwt.claim.sub = 'b7000000-0000-0000-0000-000000000001';
select is((select count(*)::int from worker_private), 0, 'La empresa no ve la dirección del trabajador');
select set_config('t.offer', send_offer(current_setting('t.app')::uuid)::text, true);
set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000001';
select throws_like($$ select respond_offer(current_setting('t.offer')::uuid, true, true) $$, '%condiciones de asistencia%',
  'Aceptar exige la condición de asistencia');
select set_config('t.book', respond_offer(current_setting('t.offer')::uuid, true, true, null, '2026-10-09')::text, true);
select is((select worker_terms_version from bookings where id = current_setting('t.book')::uuid), '2026-10-09', 'Se registra la condición aceptada');

-- ============================================================ Inasistencia
set local request.jwt.claim.sub = 'b7000000-0000-0000-0000-000000000001';
select throws_like($$ select report_no_show(current_setting('t.book')::uuid, 'No llegó ni avisó al encargado') $$, '%15 minutos%',
  'No se puede informar antes de la hora de inicio');
reset role;  -- simula que el turno ya comenzó
update bookings set starts_at = now() - interval '1 hour', ends_at = now() + interval '4 hours' where id = current_setting('t.book')::uuid;
set local role authenticated;
set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000002';
select throws_like($$ select report_no_show(current_setting('t.book')::uuid, 'Reporte falso de un tercero') $$, '%no encontrada%',
  'Solo la empresa del turno puede informar');
set local request.jwt.claim.sub = 'b7000000-0000-0000-0000-000000000001';
select lives_ok($$ select set_config('t.susp', report_no_show(current_setting('t.book')::uuid, 'No llegó ni avisó al encargado')::text, true) $$,
  'La empresa informa la inasistencia');
select throws_like($$ select report_no_show(current_setting('t.book')::uuid, 'Segundo reporte del mismo turno') $$, '%turno confirmado%',
  'No se informa dos veces');

set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000001';
select is((select status::text from applications where id = current_setting('t.app')::uuid), 'incidencia_reportada', 'La postulación queda con incidencia');
select ok(is_suspended(auth.uid()), 'La cuenta queda suspendida al instante');
select ok((select min_until > now() + interval '47 hours' from worker_suspensions where id = current_setting('t.susp')::uuid), 'Por al menos 48 horas');
reset role;
insert into job_posts (id, business_id, title, category_id, description, starts_at, ends_at, comuna_id, pay_type, pay_amount_clp, contract_type, status, published_at)
  values ('c7000000-0000-0000-0000-000000000002', 'b7000000-0000-0000-0000-000000000001', 'Reponedor de góndolas', (select id from categories where slug = 'reponedor'),
          'Reposición de productos en góndolas.', now() + interval '3 days', now() + interval '3 days 5 hours',
          (select id from comunas where name = 'Santiago'), 'total', 30000, 'por_obra', 'publicada', now());
set local role authenticated;
select throws_like($$ select apply_to_job('c7000000-0000-0000-0000-000000000002', true) $$, '%suspendida%', 'Suspendido no puede postular');
select lives_ok($$ select submit_suspension_statement(current_setting('t.susp')::uuid, 'Avisé por chat que tuve un accidente camino al local') $$,
  'Puede enviar su descargo');
select throws_like($$ select submit_suspension_statement(current_setting('t.susp')::uuid, 'Otro descargo más') $$, '%Ya enviaste%', 'Un solo descargo');
select throws_ok($$ select admin_lift_suspension(current_setting('t.susp')::uuid, 'Me reactivo solo') $$, '42501', null,
  'El trabajador no puede reactivarse');

set local request.jwt.claim.sub = 'ad700000-0000-0000-0000-000000000001';
select is((select worker_statement from worker_suspensions where id = current_setting('t.susp')::uuid),
  'Avisé por chat que tuve un accidente camino al local', 'El administrador ve el descargo');
select throws_like($$ select admin_lift_suspension(current_setting('t.susp')::uuid, 'Revisado') $$, '%48 horas%',
  'Antes de 48 h no se reactiva, salvo reporte erróneo');
select lives_ok($$ select admin_lift_suspension(current_setting('t.susp')::uuid, 'El trabajador avisó a tiempo por chat', true) $$,
  'Con reporte erróneo el administrador puede reactivar antes');
select ok(not is_suspended('a7000000-0000-0000-0000-000000000001'), 'La cuenta queda reactivada');

select * from finish();
rollback;
