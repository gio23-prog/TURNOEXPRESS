-- Pruebas de la migración 7: datos legales de la empresa y preguntas del empleador.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
 ('b1000000-0000-0000-0000-000000000001','emp@test.cl','{"role":"empresa","full_name":"Empresa Q","accepted_terms":true,"accepted_privacy":true}'),
 ('a1000000-0000-0000-0000-000000000001','w1@test.cl','{"role":"trabajador","full_name":"Trabajador Uno","accepted_terms":true,"accepted_privacy":true}'),
 ('a1000000-0000-0000-0000-000000000002','w2@test.cl','{"role":"trabajador","full_name":"Trabajador Dos","accepted_terms":true,"accepted_privacy":true}');

select set_config('t.start', ((now() + interval '2 days')::date + time '10:00')::timestamptz::text, true);

set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000001';

-- ============================================================ Perfil incompleto
insert into business_profiles (user_id, trade_name, comuna_id) values (auth.uid(), 'Cafetería Q', (select id from comunas where name = 'Santiago'));
select throws_ok($$ update business_profiles set legal_rep_rut = '11.111.111-2' where user_id = auth.uid() $$,
  '23514', null, 'RUT del representante con dígito verificador incorrecto es rechazado');

with x as (
  insert into job_posts (business_id, title, category_id, description, starts_at, ends_at, comuna_id, pay_type, pay_amount_clp,
                         q_autonomy, q_direct_supervision, q_imposed_schedule, q_continuous_instructions, q_core_recurring)
  values (auth.uid(), 'Barista fin de semana', (select id from categories where slug = 'barista'),
          'Preparación de café de especialidad en barra.', current_setting('t.start')::timestamptz,
          current_setting('t.start')::timestamptz + interval '5 hours', (select id from comunas where name = 'Santiago'),
          'total', 30000, true, false, false, false, false)
  returning id)
select set_config('t.job', id::text, true) from x;
insert into job_post_private (job_id, address_line) values (current_setting('t.job')::uuid, 'Huérfanos 1234');

select throws_like($$ select publish_job(current_setting('t.job')::uuid) $$, '%Completa los datos de tu empresa%giro%',
  'No se puede publicar con datos de empresa incompletos');

update business_profiles set rut = '76.543.210-3', legal_name = 'Cafetería Q SpA', giro = 'Cafeterías',
  fiscal_address = 'Huérfanos 1234', legal_rep_name = 'Empresa Q', legal_rep_rut = '33.333.333-3',
  contact_name = 'Encargada Turno', contact_position = 'Administradora', contact_phone = '+56911112222'
 where user_id = auth.uid();

-- ============================================================ Preguntas
select throws_ok($$ insert into job_questions (job_id, position, prompt, kind, options)
  values (current_setting('t.job')::uuid, 1, '¿Qué prefieres?', 'opcion', array['Solo una']) $$,
  '23514', null, 'Una pregunta de opciones necesita al menos 2 opciones');
select throws_ok($$ insert into job_questions (job_id, position, prompt, kind, disqualifying)
  values (current_setting('t.job')::uuid, 1, '¿Tienes experiencia?', 'si_no', array['si','no']) $$,
  '23514', null, 'No se pueden excluir todas las respuestas');

insert into job_questions (job_id, position, prompt, kind, disqualifying) values
  (current_setting('t.job')::uuid, 1, '¿Tienes experiencia con máquina de espresso?', 'si_no', array['no']);
insert into job_questions (job_id, position, prompt, kind, options, disqualifying) values
  (current_setting('t.job')::uuid, 2, '¿Cuántos años de experiencia tienes?', 'opcion', array['Menos de 1','1 a 3','Más de 3'], array['Menos de 1']);
insert into job_questions (job_id, position, prompt, kind, required) values
  (current_setting('t.job')::uuid, 3, '¿Qué método de filtrado manejas?', 'texto', false);
select set_config('t.q1', (select id::text from job_questions where job_id = current_setting('t.job')::uuid and position = 1), true);
select set_config('t.q2', (select id::text from job_questions where job_id = current_setting('t.job')::uuid and position = 2), true);

select is(publish_job(current_setting('t.job')::uuid)::text, 'publicada', 'Con datos completos se publica');
select throws_ok($$ insert into job_questions (job_id, position, prompt, kind)
  values (current_setting('t.job')::uuid, 4, 'Pregunta tardía', 'texto') $$,
  '42501', null, 'No se agregan preguntas a un turno ya publicado');
select is((select count(*)::int from my_job_questions(current_setting('t.job')::uuid) where disqualifying is not null), 2,
  'La empresa ve sus respuestas excluyentes');

-- ============================================================ Trabajadores
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
insert into worker_profiles (user_id, display_name) values (auth.uid(), 'Trabajador U.');
select is((select count(*)::int from job_questions where job_id = current_setting('t.job')::uuid), 3, 'El trabajador ve las preguntas');
select throws_ok($$ select disqualifying from job_questions $$, '42501', null, 'El trabajador no puede ver las respuestas excluyentes');
select throws_ok($$ select * from my_job_questions(current_setting('t.job')::uuid) $$, 'P0002', null,
  'El trabajador no accede a las preguntas completas');
select throws_ok($$ select business_profile_missing(auth.uid()) $$, '42501', null, 'Función interna no expuesta');

select throws_like($$ select apply_to_job(current_setting('t.job')::uuid, true, null, null, '{}'::jsonb) $$,
  '%Responde la pregunta%', 'Exige responder preguntas obligatorias');
select throws_like($$ select apply_to_job(current_setting('t.job')::uuid, true, null, null,
  jsonb_build_object(current_setting('t.q1'), 'quizás', current_setting('t.q2'), '1 a 3')) $$,
  '%Respuesta inválida%', 'Rechaza respuestas fuera de las opciones');
select lives_ok($$ select set_config('t.app1', apply_to_job(current_setting('t.job')::uuid, true, null, null,
  jsonb_build_object(current_setting('t.q1'), 'si', current_setting('t.q2'), '1 a 3'))::text, true) $$,
  'Postula respondiendo (sin la pregunta opcional)');

set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000002';
insert into worker_profiles (user_id, display_name) values (auth.uid(), 'Trabajador D.');
select lives_ok($$ select set_config('t.app2', apply_to_job(current_setting('t.job')::uuid, true, null, null,
  jsonb_build_object(current_setting('t.q1'), 'no', current_setting('t.q2'), '1 a 3'))::text, true) $$,
  'Postula con una respuesta excluyente');
select is((select disqualified from applications where id = current_setting('t.app2')::uuid), true,
  'Respuesta excluyente marca al postulante');
select is((select status::text from applications where id = current_setting('t.app2')::uuid), 'pendiente',
  'No se rechaza automáticamente: decide la empresa');
select is((select count(*)::int from application_answers where application_id = current_setting('t.app1')::uuid), 0,
  'Un trabajador no ve las respuestas de otro');

-- ============================================================ Empresa
set local request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000001';
select is((select count(*)::int from application_answers a join applications p on p.id = a.application_id
           where p.job_id = current_setting('t.job')::uuid), 4, 'La empresa ve las respuestas de sus postulantes');
select is((select disqualified from applications where id = current_setting('t.app1')::uuid), false,
  'Quien cumple no queda marcado');

-- Privacidad: datos legales no visibles para trabajadores
set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
select is((select count(*)::int from business_profiles), 0, 'Los datos legales de la empresa no son visibles para trabajadores');

select * from finish();
rollback;
