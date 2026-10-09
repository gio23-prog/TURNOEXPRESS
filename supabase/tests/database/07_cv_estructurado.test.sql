-- Pruebas de la migración 18: CV estructurado.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
alter table public.job_posts alter column employer_terms_version set default 'test',
                             alter column employer_terms_accepted_at set default now();

insert into auth.users (id, email, raw_user_meta_data) values
 ('b7000000-0000-0000-0000-000000000001','e7@test.cl','{"role":"empresa","full_name":"Empresa Siete","accepted_terms":true,"accepted_privacy":true}'),
 ('b7000000-0000-0000-0000-000000000002','f7@test.cl','{"role":"empresa","full_name":"Empresa Ocho","accepted_terms":true,"accepted_privacy":true}'),
 ('a7000000-0000-0000-0000-000000000001','p7@test.cl','{"role":"trabajador","full_name":"Paula Siete","accepted_terms":true,"accepted_privacy":true}'),
 ('a7000000-0000-0000-0000-000000000002','q7@test.cl','{"role":"trabajador","full_name":"Quique Siete","accepted_terms":true,"accepted_privacy":true}');
insert into business_profiles (user_id, trade_name, comuna_id, rut, legal_name, giro, fiscal_address, legal_rep_name, legal_rep_rut, contact_name, contact_phone)
  values ('b7000000-0000-0000-0000-000000000001', 'Siete SpA', (select id from comunas where name = 'Santiago'), '76.086.428-5', 'Siete SpA', 'Comercio',
          'Moneda 1', 'Rep', '11.111.111-1', 'Enc', '+56911112222');
insert into worker_profiles (user_id, display_name, is_public) values
  ('a7000000-0000-0000-0000-000000000001', 'Paula S.', false), ('a7000000-0000-0000-0000-000000000002', 'Quique S.', false);
insert into job_posts (id, business_id, title, category_id, description, starts_at, ends_at, comuna_id, pay_type, pay_amount_clp, contract_type, status, published_at)
  values ('c7000000-0000-0000-0000-000000000001', 'b7000000-0000-0000-0000-000000000001', 'Operario de bodega', (select id from categories where slug = 'reponedor'),
          'Preparación de pedidos en bodega.', now() + interval '2 days', now() + interval '2 days 5 hours',
          (select id from comunas where name = 'Santiago'), 'total', 30000, 'por_obra', 'con_postulaciones', now());
insert into applications (job_id, worker_id, availability_confirmed)
  values ('c7000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000001', true);

set local role authenticated;
set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000001';
select lives_ok($$ update worker_profiles set headline = 'Asistente de operaciones', can_travel = true where user_id = auth.uid() $$,
  'El postulante guarda su titular y movilidad');
select lives_ok($$ insert into worker_experiences (worker_id, position, company, description, start_date, is_current)
  values (auth.uid(), 'Asistente de logística', 'Provaltec SPA', 'Preparación y despacho de pedidos.', '2019-04-01', true) $$,
  'Agrega una experiencia actual');
select throws_ok($$ insert into worker_experiences (worker_id, position, company, start_date, end_date)
  values (auth.uid(), 'Cajero', 'Tienda', '2022-01-01', '2021-01-01') $$, '23514', null, 'El término no puede ser anterior al inicio');
select throws_ok($$ insert into worker_experiences (worker_id, position, company, start_date, end_date, is_current)
  values (auth.uid(), 'Cajero', 'Tienda', '2021-01-01', '2022-01-01', true) $$, '23514', null, 'Un trabajo actual no tiene fecha de término');
select lives_ok($$ insert into worker_education (worker_id, institution, title, level, start_date, is_current)
  values (auth.uid(), 'Universidad Mayor', 'Técnico en Logística', 'tecnica', '2023-03-01', true) $$, 'Agrega formación');
select lives_ok($$ insert into worker_languages (worker_id, language, level) values (auth.uid(), 'Español', 'nativo') $$, 'Agrega idioma');
select throws_ok($$ insert into worker_languages (worker_id, language, level) values (auth.uid(), 'Inglés', 'experto') $$, '23514', null,
  'Nivel de idioma inválido rechazado');
select lives_ok($$ insert into worker_skill_tags (worker_id, tag) select auth.uid(), 'Habilidad ' || g from generate_series(1, 30) g $$,
  'Agrega hasta 30 habilidades');
select throws_like($$ insert into worker_skill_tags (worker_id, tag) values (auth.uid(), 'Una más') $$, '%hasta 30%',
  'No permite más de 30 habilidades');
select throws_ok($$ insert into worker_experiences (worker_id, position, company, start_date)
  values ('a7000000-0000-0000-0000-000000000002', 'Falso', 'Ajena', '2020-01-01') $$, '42501', null, 'No puede escribir el CV de otra persona');

-- La empresa a la que postuló ve el CV; otra empresa y otro postulante no.
set local request.jwt.claim.sub = 'b7000000-0000-0000-0000-000000000001';
select is((select count(*)::int from worker_experiences where worker_id = 'a7000000-0000-0000-0000-000000000001'), 1,
  'La empresa ve la experiencia de quien le postuló');
select is((select count(*)::int from worker_skill_tags where worker_id = 'a7000000-0000-0000-0000-000000000001'), 30,
  'La empresa ve las habilidades de quien le postuló');
select is((select headline from worker_profiles where user_id = 'a7000000-0000-0000-0000-000000000001'), 'Asistente de operaciones',
  'La empresa ve el titular');
update worker_experiences set company = 'Otra';
reset role;
select is((select company from worker_experiences where worker_id = 'a7000000-0000-0000-0000-000000000001'), 'Provaltec SPA',
  'La empresa no puede modificar el CV');
set local role authenticated;
set local request.jwt.claim.sub = 'b7000000-0000-0000-0000-000000000002';
select is((select count(*)::int from worker_experiences), 0, 'Una empresa sin relación no ve el CV');
set local request.jwt.claim.sub = 'a7000000-0000-0000-0000-000000000002';
select is((select count(*)::int from worker_education), 0, 'Otro postulante no ve el CV');

select * from finish();
rollback;
