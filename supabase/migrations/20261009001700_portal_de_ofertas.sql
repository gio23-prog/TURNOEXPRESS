-- ============================================================================
-- TurnoExpress · Migración 17: portal de difusión de ofertas
-- TurnoExpress solo difunde ofertas y recibe postulaciones. No participa en la selección,
-- la contratación ni el pago: después de postular, la empresa contacta directamente al postulante.
--   · Se eliminan ofertas formales, contrataciones, cambios, mensajes, evaluaciones y boletas.
--   · La empresa ve el contacto (nombre, teléfono, correo) y el CV de quien postula a su oferta.
--   · La dirección exacta deja de pedirse (nadie la veía salvo la empresa).
--   · Empresas: un mes gratis desde su registro (trial_ends_at). Aún no se cobra nada.
-- ============================================================================
set search_path = public, extensions;

-- 1. Estados que dejan de existir ----------------------------------------------------
update public.applications set status = 'preseleccionada'
 where status in ('oferta_enviada', 'aceptada', 'finalizada', 'incidencia_reportada');
update public.job_posts set status = 'vencida' where status in ('cubierta', 'en_curso', 'finalizada');

alter table public.applications add constraint applications_estado_portal
  check (status in ('pendiente', 'en_revision', 'preseleccionada', 'rechazada', 'retirada'));
alter table public.job_posts add constraint job_posts_estado_portal
  check (status in ('borrador', 'publicada', 'en_revision', 'con_postulaciones', 'cancelada', 'vencida'));

-- 2. Dirección exacta: solo la empresa y administración --------------------------------
drop policy if exists job_private_read on public.job_post_private;
create policy job_private_read on public.job_post_private for select using (
  public.is_job_owner(job_id) or public.is_admin()
);
drop function public.has_active_booking_on_job(uuid);

-- 3. Vistas sin evaluaciones -----------------------------------------------------------
drop view if exists public.v_worker_ratings;
drop view if exists public.v_public_businesses;
create view public.v_public_businesses with (security_barrier = true) as
select b.user_id, b.trade_name, b.business_type, b.description, b.comuna_id, c.name as comuna, b.verification_status
from public.business_profiles b
join public.profiles p on p.id = b.user_id and not p.is_blocked
left join public.comunas c on c.id = b.comuna_id;
grant select on public.v_public_businesses to anon, authenticated;

-- 4. Funciones de contratación que se eliminan ------------------------------------------
drop function if exists public.send_offer(uuid, text);
drop function if exists public.respond_offer(uuid, boolean, boolean, text);
drop function if exists public.confirm_completion(uuid);
drop function if exists public.cancel_booking(uuid, text);
drop function if exists public.report_incident(uuid, text, text);
drop function if exists public.propose_booking_change(uuid, text, timestamptz, timestamptz, int);
drop function if exists public.respond_booking_change(uuid, boolean);
drop function if exists public.submit_review(uuid, int, text);
drop function if exists public.request_tax_document(uuid);
drop function if exists public.register_tax_document(uuid, public.tax_doc_status, text, date, int, text, text);
drop function if exists public.mark_tax_document_reviewed(uuid);
drop function if exists public.admin_set_review_hidden(uuid, boolean, text);
drop function if exists public.my_overlapping_bookings(uuid);
drop function if exists public._ensure_conversation(uuid);

-- 5. Funciones que se reescriben sin contrataciones ------------------------------------
create or replace function public._cancel_job(p_job uuid, p_actor uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare r record; t text;
begin
  select title into t from public.job_posts where id = p_job;
  for r in update public.applications set status = 'rechazada'
            where job_id = p_job and status in ('pendiente', 'en_revision', 'preseleccionada')
            returning worker_id loop
    perform public._notify(r.worker_id, 'oferta_cerrada', 'Oferta cerrada',
      format('La empresa cerró la oferta "%s".', t), '/trabajador/postulaciones');
  end loop;
  update public.job_posts set status = 'cancelada', cancelled_at = now(), cancelled_by = p_actor,
         cancel_reason = p_reason where id = p_job;
end $$;

create or replace function public.cancel_job(p_job uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); j public.job_posts;
begin
  select * into j from public.job_posts where id = p_job for update;
  if not found or (j.business_id <> uid and not public.is_admin('moderador')) then
    raise exception 'Oferta no encontrada' using errcode = 'P0002';
  end if;
  if j.status in ('cancelada', 'vencida') then
    raise exception 'Esta oferta ya está cerrada' using errcode = 'P0001';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'Indica el motivo del cierre' using errcode = 'P0001';
  end if;
  perform public._cancel_job(p_job, uid, trim(p_reason));
  perform public._audit('job.close', 'job_posts', p_job::text, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.withdraw_application(p_app uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); a public.applications; biz uuid;
begin
  select * into a from public.applications where id = p_app for update;
  if not found or a.worker_id <> uid then raise exception 'Postulación no encontrada' using errcode = 'P0002'; end if;
  if a.status not in ('pendiente', 'en_revision', 'preseleccionada') then
    raise exception 'Esta postulación ya no se puede retirar' using errcode = 'P0001';
  end if;
  update public.applications set status = 'retirada' where id = p_app;
  select business_id into biz from public.job_posts where id = a.job_id;
  perform public._notify(biz, 'postulacion_retirada', 'Postulación retirada',
    'Un postulante retiró su postulación.', '/empresa/publicaciones/' || a.job_id);
end $$;

create or replace function public.set_application_status(p_app uuid, p_status public.application_status)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); a public.applications; j public.job_posts;
begin
  select * into a from public.applications where id = p_app for update;
  if not found then raise exception 'Postulación no encontrada' using errcode = 'P0002'; end if;
  select * into j from public.job_posts where id = a.job_id;
  if j.business_id <> uid then raise exception 'Postulación no encontrada' using errcode = 'P0002'; end if;
  if not ((a.status = 'pendiente'       and p_status in ('en_revision', 'preseleccionada', 'rechazada'))
       or (a.status = 'en_revision'     and p_status in ('preseleccionada', 'rechazada'))
       or (a.status = 'preseleccionada' and p_status in ('en_revision', 'rechazada'))) then
    raise exception 'Cambio de estado no permitido: % → %', a.status, p_status using errcode = 'P0001';
  end if;
  update public.applications set status = p_status where id = p_app;
  if p_status = 'preseleccionada' then
    perform public._notify(a.worker_id, 'preseleccion', '¡Fuiste preseleccionado!',
      format('La empresa te preseleccionó para "%s" y podría contactarte directamente.', j.title), '/trabajador/postulaciones');
  elsif p_status = 'rechazada' then
    perform public._notify(a.worker_id, 'postulacion_rechazada', 'Postulación no seleccionada',
      format('Tu postulación a "%s" no fue seleccionada esta vez.', j.title), '/trabajador/postulaciones');
  end if;
end $$;

create or replace function public.refresh_time_states() returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_exp int;
begin
  update public.job_posts j set status = 'vencida'
   where j.status in ('publicada', 'con_postulaciones', 'en_revision')
     and (j.starts_at <= now() or (j.apply_deadline is not null and j.apply_deadline <= now()));
  get diagnostics n_exp = row_count;
  return jsonb_build_object('ofertas_vencidas', n_exp);
end $$;

create or replace function public.admin_metrics(p_include_demo boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  perform public._require_admin('soporte');
  with u as (select * from public.profiles where p_include_demo or not is_demo),
       j as (select jp.* from public.job_posts jp join u on u.id = jp.business_id),
       pub as (select * from j where published_at is not null),
       first_app as (select a.job_id, min(a.created_at) as t from public.applications a group by a.job_id)
  select jsonb_build_object(
    'incluye_demo', p_include_demo,
    'usuarios', (select count(*) from u),
    'empresas', (select count(*) from u where role = 'empresa'),
    'trabajadores', (select count(*) from u where role = 'trabajador'),
    'empresas_activas_30d', (select count(distinct business_id) from j where created_at > now() - interval '30 days'),
    'postulantes_activos_30d', (select count(distinct a.worker_id) from public.applications a join u on u.id = a.worker_id
                                 where a.created_at > now() - interval '30 days'),
    'ofertas_publicadas', (select count(*) from pub),
    'ofertas_por_categoria', (select coalesce(jsonb_object_agg(cat, n), '{}'::jsonb) from (
        select coalesce(pc.name, c.name) as cat, count(*) as n from pub
        join public.categories c on c.id = pub.category_id left join public.categories pc on pc.id = c.parent_id
        group by 1) s),
    'postulaciones', (select count(*) from public.applications a join pub on pub.id = a.job_id),
    'minutos_promedio_primera_postulacion', (select round(avg(extract(epoch from (fa.t - pub.published_at)) / 60)::numeric, 1)
                                             from pub join first_app fa on fa.job_id = pub.id),
    'ingresos_clp', null,
    'nota_ingresos', 'Sin integración de pagos: no hay ingresos registrados.'
  ) into res;
  return res;
end $$;

create or replace function public.business_metrics() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public._require_user();
begin
  return (select jsonb_build_object(
    'ofertas', count(distinct j.id),
    'ofertas_activas', count(distinct j.id) filter (where j.status in ('publicada', 'con_postulaciones', 'en_revision')),
    'postulaciones', (select count(*) from public.applications a join public.job_posts x on x.id = a.job_id
                       where x.business_id = uid and a.status <> 'retirada'))
  from public.job_posts j where j.business_id = uid);
end $$;

create or replace function public.publish_job(p_job uuid) returns public.job_status
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); j public.job_posts; max_posts int; active_posts int;
        new_status public.job_status; problemas text[]; motivos text[] := '{}'; seguimiento text;
        independiente boolean;
begin
  select * into j from public.job_posts where id = p_job for update;
  if not found or j.business_id <> uid then
    raise exception 'Oferta no encontrada' using errcode = 'P0002';
  end if;
  if j.status <> 'borrador' then
    raise exception 'Sólo se pueden publicar borradores' using errcode = 'P0001';
  end if;
  if j.starts_at <= now() + interval '30 minutes' then
    raise exception 'La oferta debe comenzar al menos 30 minutos después de publicarla' using errcode = 'P0001';
  end if;
  if j.apply_deadline is not null and j.apply_deadline <= now() then
    raise exception 'La fecha límite para postular ya pasó' using errcode = 'P0001';
  end if;

  problemas := public.job_content_issues(p_job);
  if cardinality(problemas) > 0 then
    raise exception 'La publicación no cumple las normas: %', array_to_string(problemas, '; ') using errcode = 'P0001';
  end if;

  -- El cuestionario de modalidad aplica solo a la prestación independiente (honorarios o sin definir).
  independiente := j.engagement_mode <> 'relacion_laboral';
  if independiente then
    if j.labor_risk is null then
      raise exception 'Debes responder las preguntas sobre la modalidad de prestación' using errcode = 'P0001';
    end if;
    if j.labor_risk in ('medio','alto') and j.labor_warning_ack_at is null then
      raise exception 'Debes leer y confirmar la advertencia sobre la modalidad de contratación' using errcode = 'P0001';
    end if;
  end if;

  select p.max_active_posts into max_posts
    from public.subscriptions s join public.plans p on p.id = s.plan_id
   where s.business_id = uid and s.status = 'activa';
  if not found then select max_active_posts into max_posts from public.plans where id = 'gratis'; end if;
  select count(*) into active_posts from public.job_posts
   where business_id = uid and status in ('publicada','con_postulaciones','en_revision');
  if max_posts is not null and active_posts >= max_posts then
    raise exception 'Alcanzaste el máximo de % publicaciones activas de tu plan', max_posts using errcode = 'P0001';
  end if;

  -- Honorarios con indicios: se publica de inmediato y queda marcado para revisión posterior (no bloquea).
  if independiente and j.labor_risk = 'alto' then
    seguimiento := 'Boleta de honorarios con indicios de relación laboral';
  end if;
  if public._setting_int('max_hourly_review_clp', 0) > 0
     and j.hourly_equivalent_clp > public._setting_int('max_hourly_review_clp', 0) then
    motivos := array_append(motivos, 'pago por hora inusualmente alto');
  end if;

  new_status := case when cardinality(motivos) > 0 then 'en_revision' else 'publicada' end;
  update public.job_posts
     set status = new_status,
         published_at = case when new_status = 'publicada' then now() end,
         review_note = case when new_status = 'en_revision' then 'Revisión automática: ' || array_to_string(motivos, '; ') end,
         followup_reason = seguimiento,
         followup_status = case when seguimiento is not null then 'pendiente' end
   where id = p_job;

  perform public._audit('job.publish', 'job_posts', p_job::text,
    jsonb_build_object('status', new_status, 'labor_risk', j.labor_risk, 'contract_type', j.contract_type,
                       'engagement_mode', j.engagement_mode, 'motivos', motivos, 'seguimiento', seguimiento));
  if new_status = 'en_revision' then
    perform public._notify_admins('revision_publicacion', 'Publicación en revisión',
      format('"%s": %s.', j.title, array_to_string(motivos, '; ')), '/admin/publicaciones/' || p_job);
  elsif seguimiento is not null then
    perform public._notify_admins('seguimiento_publicacion', 'Oferta publicada para revisar después',
      format('"%s": %s.', j.title, seguimiento), '/admin/publicaciones/' || p_job);
  end if;
  return new_status;
end $$;

create or replace function public.apply_to_job(p_job uuid, p_availability_confirmed boolean,
  p_message text default null, p_highlighted_experience text default null,
  p_answers jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); j public.job_posts; app_id uuid;
        q public.job_questions; v text; descartado boolean := false; cv text;
begin
  if public.my_role() <> 'trabajador' then
    raise exception 'Sólo las cuentas de trabajador pueden postular' using errcode = '42501';
  end if;
  if not exists (select 1 from public.worker_profiles where user_id = uid) then
    raise exception 'Completa tu perfil antes de postular' using errcode = 'P0001';
  end if;
  select w.cv_path into cv from public.worker_profiles w where w.user_id = uid;
  if cv is null then
    raise exception 'Sube tu currículum antes de postular' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles p where p.id = uid and (p.rut is null or p.phone is null))
     or not exists (select 1 from public.worker_private x where x.user_id = uid) then
    raise exception 'Completa tus datos personales (teléfono, RUT y dirección) antes de postular' using errcode = 'P0001';
  end if;
  if p_availability_confirmed is not true then
    raise exception 'Debes confirmar que tienes disponibilidad en el horario de la oferta' using errcode = 'P0001';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Respuestas inválidas' using errcode = 'P0001';
  end if;
  select * into j from public.job_posts where id = p_job for update;
  if not found or not public.job_is_listed(j.status) then
    raise exception 'Esta oferta no está disponible' using errcode = 'P0002';
  end if;
  if j.starts_at <= now() or (j.apply_deadline is not null and j.apply_deadline <= now()) then
    raise exception 'El plazo para postular terminó' using errcode = 'P0001';
  end if;
  begin
    insert into public.applications (job_id, worker_id, message, highlighted_experience, availability_confirmed, cv_path)
    values (p_job, uid, nullif(trim(p_message), ''), nullif(trim(p_highlighted_experience), ''), true, cv)
    returning id into app_id;
  exception when unique_violation then
    raise exception 'Ya postulaste a esta oferta' using errcode = 'P0001';
  end;

  for q in select * from public.job_questions where job_id = p_job order by position loop
    v := nullif(trim(p_answers ->> q.id::text), '');
    if v is null then
      if q.required then
        raise exception 'Responde la pregunta: %', q.prompt using errcode = 'P0001';
      end if;
      continue;
    end if;
    if (q.kind = 'si_no' and v not in ('si', 'no'))
       or (q.kind = 'opcion' and not (v = any(q.options)))
       or (q.kind = 'texto' and length(v) > 500) then
      raise exception 'Respuesta inválida en: %', q.prompt using errcode = 'P0001';
    end if;
    insert into public.application_answers (application_id, question_id, answer) values (app_id, q.id, v);
    if q.disqualifying is not null and v = any(q.disqualifying) then
      descartado := true;
    end if;
  end loop;

  if descartado then
    update public.applications set disqualified = true where id = app_id;
  end if;
  if j.status = 'publicada' then
    update public.job_posts set status = 'con_postulaciones' where id = p_job;
  end if;
  perform public._notify(j.business_id, 'nueva_postulacion', 'Nueva postulación',
    format('Recibiste una postulación para "%s".', j.title), '/empresa/publicaciones/' || p_job);
  return app_id;
end $$;

drop function if exists public._active_bookings(uuid);

-- 6. Tablas de contratación ---------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    execute 'drop policy if exists "docs: lectura partes" on storage.objects';
    execute 'drop policy if exists "docs: subir en carpeta propia" on storage.objects';
  end if;
end $$;

alter table public.payments drop column if exists booking_id;
drop table if exists public.tax_documents;
drop table if exists public.reviews;
drop table if exists public.messages;
drop table if exists public.conversations;
drop table if exists public.booking_change_requests;
drop table if exists public.booking_status_history;
drop table if exists public.bookings;
drop table if exists public.offers;
drop function if exists public.log_booking_status();
drop type if exists public.offer_status;
drop type if exists public.booking_status;
drop type if exists public.tax_doc_status;
drop type if exists public.change_status;

-- 7. Contacto del postulante para la empresa -------------------------------------------------
-- Al postular, la persona acepta que la empresa vea su nombre, teléfono, correo y CV.
-- Si retira la postulación, la empresa deja de verlos.
create or replace function public.job_applicant_contacts(p_job uuid)
returns table (application_id uuid, full_name text, phone text, email text)
language sql stable security definer set search_path = public, auth as $$
  select a.id, p.full_name, p.phone, u.email::text
  from public.applications a
  join public.job_posts j on j.id = a.job_id
  join public.profiles p on p.id = a.worker_id
  left join auth.users u on u.id = a.worker_id
  where a.job_id = p_job and j.business_id = auth.uid() and a.status <> 'retirada'
$$;

-- El CV de una postulación retirada tampoco queda disponible para la empresa.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    execute 'drop policy if exists "cv: leer propio o postulado" on storage.objects';
    execute $p$ create policy "cv: leer propio o postulado" on storage.objects for select to authenticated
      using (bucket_id = 'curriculums' and (
        (storage.foldername(name))[1] = auth.uid()::text
        or exists (select 1 from public.applications a join public.job_posts j on j.id = a.job_id
                   where a.cv_path = name and j.business_id = auth.uid() and a.status <> 'retirada')
        or public.is_admin())) $p$;
  end if;
end $$;

-- 8. Mes gratis para empresas -------------------------------------------------------------
alter table public.business_profiles add column trial_ends_at timestamptz;
update public.business_profiles set trial_ends_at = created_at + interval '1 month';
alter table public.business_profiles
  alter column trial_ends_at set default (now() + interval '1 month'),
  alter column trial_ends_at set not null;

-- 9. Permisos -------------------------------------------------------------------------------
revoke execute on function public.job_applicant_contacts(uuid), public.publish_job(uuid),
  public.apply_to_job(uuid, boolean, text, text, jsonb), public.cancel_job(uuid, text),
  public.withdraw_application(uuid), public.set_application_status(uuid, public.application_status),
  public.admin_metrics(boolean), public.business_metrics(), public._cancel_job(uuid, uuid, text),
  public.refresh_time_states()
  from public, anon;
grant execute on function public.job_applicant_contacts(uuid), public.publish_job(uuid),
  public.apply_to_job(uuid, boolean, text, text, jsonb), public.cancel_job(uuid, text),
  public.withdraw_application(uuid), public.set_application_status(uuid, public.application_status),
  public.admin_metrics(boolean), public.business_metrics()
  to authenticated;
revoke execute on function public._cancel_job(uuid, uuid, text) from authenticated;
grant execute on function public.refresh_time_states() to service_role;
