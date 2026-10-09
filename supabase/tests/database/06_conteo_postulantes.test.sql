-- Pruebas de la migración 14: conteo de postulantes.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
alter table public.job_posts alter column employer_terms_version set default 'test',
                             alter column employer_terms_accepted_at set default now();

insert into auth.users (id, email, raw_user_meta_data) values
 ('b5000000-0000-0000-0000-000000000001','e@test.cl','{"role":"empresa","full_name":"Empresa E","accepted_terms":true,"accepted_privacy":true}'),
 ('a5000000-0000-0000-0000-000000000001','t1@test.cl','{"role":"trabajador","full_name":"T Uno","accepted_terms":true,"accepted_privacy":true}'),
 ('a5000000-0000-0000-0000-000000000002','t2@test.cl','{"role":"trabajador","full_name":"T Dos","accepted_terms":true,"accepted_privacy":true}');
insert into business_profiles (user_id, trade_name, comuna_id, rut, legal_name, giro, fiscal_address, legal_rep_name, legal_rep_rut, contact_name, contact_phone)
  values ('b5000000-0000-0000-0000-000000000001', 'E SpA', (select id from comunas where name = 'Santiago'), '76.086.428-5', 'E SpA', 'Comercio',
          'Moneda 1', 'Rep', '11.111.111-1', 'Enc', '+56911112222');
insert into worker_profiles (user_id, display_name) values ('a5000000-0000-0000-0000-000000000001', 'T U.'), ('a5000000-0000-0000-0000-000000000002', 'T D.');
insert into job_posts (id, business_id, title, category_id, description, starts_at, ends_at, comuna_id, pay_type, pay_amount_clp, contract_type, status, published_at)
  values ('c5000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001', 'Reponedor de bodega', (select id from categories where slug = 'reponedor'),
          'Reposición de productos en góndolas.', now() + interval '2 days', now() + interval '2 days 5 hours',
          (select id from comunas where name = 'Santiago'), 'total', 30000, 'por_obra', 'con_postulaciones', now());
insert into applications (job_id, worker_id, availability_confirmed) values
  ('c5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', true),
  ('c5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000002', true);

set local role authenticated;
set local request.jwt.claim.sub = 'a5000000-0000-0000-0000-000000000001';
select is((select count(*)::int from applications where job_id = 'c5000000-0000-0000-0000-000000000001'), 1, 'El trabajador solo ve su postulación');
select is((select applicants::int from job_applicant_counts(array['c5000000-0000-0000-0000-000000000001'::uuid])), 2, 'Pero ve cuántos postularon');

select * from finish();
rollback;
