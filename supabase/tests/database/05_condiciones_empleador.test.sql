-- Pruebas de la migración 11: condiciones del empleador.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
 ('b4000000-0000-0000-0000-000000000001','c1@test.cl','{"role":"empresa","full_name":"Condiciones","accepted_terms":true,"accepted_privacy":true}');
insert into business_profiles (user_id, trade_name, comuna_id, rut, legal_name, giro, fiscal_address,
    legal_rep_name, legal_rep_rut, contact_name, contact_phone)
  values ('b4000000-0000-0000-0000-000000000001', 'Condiciones SpA', (select id from comunas where name = 'Santiago'), '76.086.428-5',
          'Condiciones SpA', 'Comercio', 'Moneda 100', 'Rep Legal', '11.111.111-1', 'Encargado', '+56911112222');

set local role authenticated;
set local request.jwt.claim.sub = 'b4000000-0000-0000-0000-000000000001';

with x as (
  insert into job_posts (business_id, title, category_id, description, starts_at, ends_at, comuna_id, pay_type, pay_amount_clp, contract_type)
  values (auth.uid(), 'Reponedor de bodega', (select id from categories where slug = 'reponedor'),
          'Reposición de productos en góndolas.', now() + interval '2 days', now() + interval '2 days 5 hours',
          (select id from comunas where name = 'Santiago'), 'total', 30000, 'por_obra')
  returning id)
select set_config('t.job', id::text, true) from x;
insert into job_post_private (job_id, address_line) values (current_setting('t.job')::uuid, 'Moneda 100');

select throws_like($$ select publish_job(current_setting('t.job')::uuid) $$, '%condiciones del empleador%',
  'No se publica sin aceptar las condiciones');
select throws_ok($$ update job_posts set employer_terms_version = '2026-10-09' where id = current_setting('t.job')::uuid $$,
  '23514', null, 'Versión y fecha de aceptación van juntas');
update job_posts set employer_terms_version = '2026-10-09', employer_terms_accepted_at = now() where id = current_setting('t.job')::uuid;
select is(publish_job(current_setting('t.job')::uuid)::text, 'publicada', 'Con las condiciones aceptadas se publica');
select is((select employer_terms_version from job_posts where id = current_setting('t.job')::uuid), '2026-10-09',
  'Queda registrada la versión aceptada');

select * from finish();
rollback;
