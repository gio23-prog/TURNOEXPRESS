-- Pruebas de la migración 10: tipo de contrato y normas de publicación.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
-- Estas pruebas no tratan sobre las condiciones del empleador (ver 05): se dan por aceptadas.
alter table public.job_posts alter column employer_terms_version set default 'test',
                             alter column employer_terms_accepted_at set default now();

insert into auth.users (id, email, raw_user_meta_data) values
 ('b3000000-0000-0000-0000-000000000001','n1@test.cl','{"role":"empresa","full_name":"Normas","accepted_terms":true,"accepted_privacy":true}');
insert into business_profiles (user_id, trade_name, comuna_id, rut, legal_name, giro, fiscal_address,
    legal_rep_name, legal_rep_rut, contact_name, contact_phone)
  values ('b3000000-0000-0000-0000-000000000001', 'Normas SpA', (select id from comunas where name = 'Santiago'), '76.086.428-5',
          'Normas SpA', 'Comercio', 'Moneda 100', 'Rep Legal', '11.111.111-1', 'Encargado', '+56911112222');
insert into subscriptions (business_id, plan_id) values ('b3000000-0000-0000-0000-000000000001', 'premium');

set local role authenticated;
set local request.jwt.claim.sub = 'b3000000-0000-0000-0000-000000000001';

-- Crea un borrador con dirección y devuelve su id. Parámetros: título, descripción, contrato, pago total, respuestas (5 booleanos o null)
create function pg_temp.borrador(t text, d text, c text, monto int, a boolean, b boolean, h boolean, i boolean, r boolean) returns uuid
language plpgsql as $$
declare jid uuid;
begin
  insert into job_posts (business_id, title, category_id, description, starts_at, ends_at, comuna_id, pay_type, pay_amount_clp,
                         contract_type, q_autonomy, q_direct_supervision, q_imposed_schedule, q_continuous_instructions, q_core_recurring)
  values (auth.uid(), t, (select id from categories where slug = 'cajero'), d, now() + interval '2 days', now() + interval '2 days 5 hours',
          (select id from comunas where name = 'Santiago'), 'total', monto, c, a, b, h, i, r)
  returning id into jid;
  insert into job_post_private (job_id, address_line) values (jid, 'Moneda 100, Santiago');
  return jid;
end $$;

-- ============================================================ Tipo de contrato
select set_config('t.pf', pg_temp.borrador('Cajero para inventario', 'Atención de caja durante el inventario anual.', 'plazo_fijo', 30000, null, null, null, null, null)::text, true);
select is((select engagement_mode::text from job_posts where id = current_setting('t.pf')::uuid),
  'relacion_laboral', 'Contrato a plazo fijo se registra como relación laboral');
select is(publish_job(current_setting('t.pf')::uuid)::text, 'publicada',
  'Con contrato de trabajo se publica sin cuestionario ni revisión');

select throws_like($$ select publish_job(pg_temp.borrador('Cajero apoyo sábado', 'Atención de caja en local de barrio.', 'honorarios', 30000, null, null, null, null, null)) $$,
  '%modalidad de prestación%', 'Con honorarios se exige el cuestionario');
select set_config('t.bajo', pg_temp.borrador('Cajero apoyo domingo', 'Atención de caja en local de barrio.', 'honorarios', 30000, true, false, false, false, false)::text, true);
select is(publish_job(current_setting('t.bajo')::uuid)::text, 'publicada', 'Honorarios con bajo riesgo se publica');
select is((select engagement_mode::text from job_posts where id = current_setting('t.bajo')::uuid), 'prestacion_independiente',
  'Honorarios se registra como prestación independiente');

select lives_ok($$ select set_config('t.alto', pg_temp.borrador('Cajero turno noche', 'Atención de caja con jefe de local.', 'honorarios', 30000, false, true, true, true, false)::text, true) $$, 'Borrador honorarios riesgo alto');
update job_posts set labor_warning_ack_at = now() where id = current_setting('t.alto')::uuid;
select is(publish_job(current_setting('t.alto')::uuid)::text, 'publicada', 'Honorarios con 3 o más indicios se publica de inmediato');
select alike((select followup_reason from job_posts where id = current_setting('t.alto')::uuid), '%indicios de relación laboral%', 'Queda marcado para revisión posterior');
select is((select followup_status from job_posts where id = current_setting('t.alto')::uuid), 'pendiente', 'Seguimiento pendiente');
select is((select followup_reason from job_posts where id = current_setting('t.bajo')::uuid), null, 'Sin indicios no queda marcado');

select is(publish_job(pg_temp.borrador('Cajero turno evento', 'Atención de caja en evento corporativo.', 'por_obra', 900000, null, null, null, null, null))::text,
  'en_revision', 'Pago por hora inusualmente alto pasa a revisión');

-- ============================================================ Normas de contenido
select throws_like($$ select publish_job(pg_temp.borrador('Cajero para tienda', 'Interesados escribir a rrhh@tienda.cl con su CV.', 'plazo_fijo', 30000, null,null,null,null,null)) $$, '%datos de contacto%', 'Rechaza correos');
select throws_like($$ select publish_job(pg_temp.borrador('Cajero para tienda', 'Más info al +56 9 1234 5678 por favor.', 'plazo_fijo', 30000, null,null,null,null,null)) $$, '%datos de contacto%', 'Rechaza teléfonos');
select throws_like($$ select publish_job(pg_temp.borrador('Cajero para tienda', 'Postula en www.mitienda.cl o por WhatsApp.', 'plazo_fijo', 30000, null,null,null,null,null)) $$, '%datos de contacto%', 'Rechaza enlaces y WhatsApp');
select throws_like($$ select publish_job(pg_temp.borrador('Cajero para tienda', 'Para empezar debes pagar la credencial de acceso.', 'plazo_fijo', 30000, null,null,null,null,null)) $$, '%cobros al trabajador%', 'Rechaza cobros al trabajador');
select throws_like($$ select publish_job(pg_temp.borrador('Vendedor de catálogo', 'Gran oportunidad de negocio con ingresos ilimitados.', 'honorarios', 30000, true,false,false,false,false)) $$, '%multinivel%', 'Rechaza multinivel');
select throws_like($$ select publish_job(pg_temp.borrador('Vendedor de tienda', 'Pago solo por comisión de ventas del día.', 'plazo_fijo', 30000, null,null,null,null,null)) $$, '%solo por comisión%', 'Rechaza pago solo por comisión');
select throws_like($$ select publish_job(pg_temp.borrador('Cajero para tienda', 'Buscamos solo mujeres con buena presencia.', 'plazo_fijo', 30000, null,null,null,null,null)) $$, '%discriminatorios%', 'Rechaza requisitos discriminatorios');
select throws_like($$ select publish_job(pg_temp.borrador('Cajero para tienda', 'Requisito: mayor de 25 años y sin hijos.', 'plazo_fijo', 30000, null,null,null,null,null)) $$, '%discriminatorios%', 'Rechaza límites de edad');
select lives_ok($$ select publish_job(pg_temp.borrador('Cajero mayor de edad', 'Requisito legal: ser mayor de 18 años.', 'plazo_fijo', 30000, null,null,null,null,null)) $$, 'Permite exigir mayoría de edad');
select throws_like($$ select publish_job(pg_temp.borrador('CAJERO PARA TIENDA', 'Atención de caja en tienda de barrio.', 'plazo_fijo', 30000, null,null,null,null,null)) $$, '%mayúsculas%', 'Rechaza título en mayúsculas');
select throws_like($$ select publish_job(pg_temp.borrador('Se necesita personal urgente', 'Atención de caja en tienda de barrio.', 'plazo_fijo', 30000, null,null,null,null,null)) $$, '%título genérico%', 'Rechaza título genérico');

select * from finish();
rollback;
