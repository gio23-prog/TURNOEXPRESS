-- Pruebas de la migración 8: registro de empresa.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
 ('b2000000-0000-0000-0000-000000000001','e1@test.cl','{"role":"empresa","full_name":"Uno","accepted_terms":true,"accepted_privacy":true}'),
 ('b2000000-0000-0000-0000-000000000002','e2@test.cl','{"role":"empresa","full_name":"Dos","accepted_terms":true,"accepted_privacy":true}');

set local role anon;
select ok(rut_empresa_disponible('76.086.428-5'), 'RUT libre: disponible (consulta anónima permitida)');
select ok(not rut_empresa_disponible('76.086.428-4'), 'RUT inválido: no disponible');

set local role authenticated;
set local request.jwt.claim.sub = 'b2000000-0000-0000-0000-000000000001';
select lives_ok($$ insert into business_profiles (user_id, trade_name, rut, sector, employees_range, shifts_per_month)
  values (auth.uid(), 'Uno', '76.086.428-5', 'Gastronomía y restaurantes', '10 a 49', '6 a 20') $$, 'Guarda sector, tamaño y turnos');
select throws_ok($$ update business_profiles set sector = 'Minería espacial' where user_id = auth.uid() $$,
  '23514', null, 'Sector fuera de la lista es rechazado');

set local request.jwt.claim.sub = 'b2000000-0000-0000-0000-000000000002';
select ok(not rut_empresa_disponible('76086428-5'), 'RUT ya registrado (en otro formato): no disponible');
select throws_ok($$ insert into business_profiles (user_id, trade_name, rut) values (auth.uid(), 'Dos', '76086428-5') $$,
  '23505', null, 'No se puede repetir el RUT escrito con otro formato');

select * from finish();
rollback;
