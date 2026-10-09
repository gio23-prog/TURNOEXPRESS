-- TurnoExpress: actualización de la migración 15 a la 17 en un solo paso.
-- Úsalo SOLO si tu base ya tiene hasta la migración 14 y no tiene la 15.
-- Ejecútalo una sola vez en el SQL Editor de Supabase.

do $$
begin
  if to_regprocedure('public.job_applicant_counts(uuid[])') is null then
    raise exception 'Falta la migración 14 (conteo de postulantes). Ejecútala primero y vuelve a correr este archivo.';
  end if;
  if not exists (select 1 from public.platform_settings where key = 'max_hourly_review_clp') then
    raise exception 'Falta la migración 13 (umbral de pago). Ejecútala primero y vuelve a correr este archivo.';
  end if;
  if to_regclass('public.worker_private') is not null then
    raise exception 'Tu base ya tiene la migración 15. No ejecutes este archivo; avísale a Claude.';
  end if;
end $$;

-- >>>>> supabase/migrations/20261009001500_trabajador_cv_inasistencia.sql
-- ============================================================================
-- Migración 15: perfil del trabajador, CV e inasistencias.
--  · worker_private: dirección del trabajador (privada: solo él y administración).
--  · RUT de persona único sin importar el formato.
--  · CV en PDF (bucket privado "curriculums"); cada postulación guarda el CV enviado.
--  · Postular exige teléfono, RUT, dirección y CV.
--  · Al aceptar un turno se acepta la condición de asistencia (versión guardada en bookings).
--  · Inasistencia: la empresa la informa desde 15 min después del inicio; la cuenta del trabajador
--    queda suspendida al instante, por al menos 48 h, y solo un administrador la reactiva.
--    El trabajador puede enviar su descargo.
-- ============================================================================
set search_path = public, extensions;

-- 1. Datos personales del trabajador -----------------------------------------
create table public.worker_private (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  address_line text not null check (length(trim(address_line)) between 5 and 200),
  comuna_id    int not null references public.comunas(id),
  updated_at   timestamptz not null default now()
);
alter table public.worker_private enable row level security;
create policy own_or_admin on public.worker_private for select using (user_id = auth.uid() or public.is_admin());
create policy own_insert on public.worker_private for insert with check (user_id = auth.uid());
create policy own_update on public.worker_private for update using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert (user_id, address_line, comuna_id), update (address_line, comuna_id) on public.worker_private to authenticated;
create trigger worker_private_updated before update on public.worker_private
  for each row execute function public.set_updated_at();

drop index if exists public.profiles_rut_uq;
create unique index profiles_rut_uq on public.profiles (public.rut_clave(rut)) where rut is not null;

-- 2. Currículum ----------------------------------------------------------------
alter table public.worker_profiles
  add column cv_path text check (cv_path is null or cv_path ~ '^[0-9a-f-]{36}/cv-[0-9]+\.pdf$'),
  add column cv_uploaded_at timestamptz;
grant insert (cv_path, cv_uploaded_at), update (cv_path, cv_uploaded_at) on public.worker_profiles to authenticated;

-- El CV debe estar en la carpeta del propio trabajador.
create or replace function public.check_cv_owner() returns trigger
language plpgsql as $$
begin
  if new.cv_path is not null and split_part(new.cv_path, '/', 1) <> new.user_id::text then
    raise exception 'Ruta de CV inválida' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger worker_profiles_cv_owner before insert or update of cv_path on public.worker_profiles
  for each row execute function public.check_cv_owner();

alter table public.applications add column cv_path text;

-- 3. Suspensiones por inasistencia --------------------------------------------
create table public.worker_suspensions (
  id               uuid primary key default gen_random_uuid(),
  worker_id        uuid not null references public.profiles(id) on delete cascade,
  booking_id       uuid references public.bookings(id) on delete set null,
  reason           text not null check (reason in ('no_presentacion')),
  reported_by      uuid references public.profiles(id),
  report_details   text not null check (length(trim(report_details)) between 10 and 1000),
  starts_at        timestamptz not null default now(),
  min_until        timestamptz not null default now() + interval '48 hours',
  worker_statement text check (worker_statement is null or length(trim(worker_statement)) between 10 and 1500),
  statement_at     timestamptz,
  lifted_at        timestamptz,
  lifted_by        uuid references public.profiles(id),
  lift_note        text,
  created_at       timestamptz not null default now(),
  check ((lifted_at is null) = (lifted_by is null))
);
create unique index suspensions_one_per_booking on public.worker_suspensions(booking_id) where booking_id is not null;
create index suspensions_active_idx on public.worker_suspensions(worker_id) where lifted_at is null;
alter table public.worker_suspensions enable row level security;
create policy own_or_admin on public.worker_suspensions for select using (worker_id = auth.uid() or public.is_admin());
grant select on public.worker_suspensions to authenticated;

create or replace function public.is_suspended(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.worker_suspensions where worker_id = p_user and lifted_at is null)
$$;

alter table public.bookings
  add column worker_terms_version text,
  add column worker_terms_accepted_at timestamptz;

-- La empresa informa que el trabajador no se presentó.
create or replace function public.report_no_show(p_booking uuid, p_details text) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); b public.bookings; sid uuid; t text;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found or b.business_id <> uid then raise exception 'Contratación no encontrada' using errcode = 'P0002'; end if;
  if b.status not in ('confirmada', 'en_curso') then
    raise exception 'Solo se puede informar una inasistencia de un turno confirmado' using errcode = 'P0001';
  end if;
  if now() < b.starts_at + interval '15 minutes' then
    raise exception 'Puedes informar la inasistencia desde 15 minutos después de la hora de inicio' using errcode = 'P0001';
  end if;
  if now() > b.ends_at + interval '48 hours' then
    raise exception 'El plazo para informar la inasistencia terminó (48 horas después del turno)' using errcode = 'P0001';
  end if;
  if b.worker_done_at is not null then
    raise exception 'El trabajador ya confirmó que realizó el servicio. Reporta una incidencia para que la revisemos.' using errcode = 'P0001';
  end if;
  if p_details is null or length(trim(p_details)) < 10 then
    raise exception 'Describe brevemente lo ocurrido (mínimo 10 caracteres)' using errcode = 'P0001';
  end if;

  update public.bookings set status = 'incidencia' where id = p_booking;
  update public.applications set status = 'incidencia_reportada' where id = b.application_id;
  insert into public.reports (reporter_id, target_type, target_id, reason, details)
  values (uid, 'contratacion', p_booking, 'no_presentacion', trim(p_details));
  insert into public.worker_suspensions (worker_id, booking_id, reason, reported_by, report_details)
  values (b.worker_id, p_booking, 'no_presentacion', uid, trim(p_details))
  returning id into sid;

  select title into t from public.job_posts where id = b.job_id;
  perform public._audit('booking.no_show', 'bookings', p_booking::text, jsonb_build_object('suspension_id', sid));
  perform public._notify(b.worker_id, 'cuenta_suspendida', 'Tu cuenta fue suspendida',
    format('La empresa informó que no te presentaste al turno "%s". Puedes enviar tu descargo desde Mis postulaciones.', t),
    '/trabajador/postulaciones');
  perform public._notify_admins('inasistencia', 'Inasistencia informada',
    format('Turno "%s": revisar suspensión.', t), '/admin/suspensiones');
  return sid;
end $$;

-- El trabajador envía su descargo (una vez).
create or replace function public.submit_suspension_statement(p_suspension uuid, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare s public.worker_suspensions;
begin
  select * into s from public.worker_suspensions where id = p_suspension for update;
  if not found or s.worker_id <> auth.uid() then raise exception 'Suspensión no encontrada' using errcode = 'P0002'; end if;
  if s.lifted_at is not null then raise exception 'La suspensión ya fue levantada' using errcode = 'P0001'; end if;
  if s.worker_statement is not null then raise exception 'Ya enviaste tu descargo' using errcode = 'P0001'; end if;
  if p_text is null or length(trim(p_text)) < 10 then
    raise exception 'Escribe tu descargo (mínimo 10 caracteres)' using errcode = 'P0001';
  end if;
  update public.worker_suspensions set worker_statement = trim(p_text), statement_at = now() where id = p_suspension;
  perform public._notify_admins('descargo', 'Nuevo descargo', 'Un trabajador respondió a su suspensión.', '/admin/suspensiones');
end $$;

-- Solo un administrador reactiva la cuenta. Antes de las 48 h solo si el reporte fue erróneo.
create or replace function public.admin_lift_suspension(p_suspension uuid, p_note text, p_reporte_erroneo boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_admin('moderador'); s public.worker_suspensions;
begin
  select * into s from public.worker_suspensions where id = p_suspension for update;
  if not found then raise exception 'Suspensión no encontrada' using errcode = 'P0002'; end if;
  if s.lifted_at is not null then raise exception 'La suspensión ya fue levantada' using errcode = 'P0001'; end if;
  if p_note is null or length(trim(p_note)) < 5 then raise exception 'Agrega una nota' using errcode = 'P0001'; end if;
  if now() < s.min_until and not p_reporte_erroneo then
    raise exception 'La suspensión mínima es de 48 horas. Solo puedes levantarla antes si el reporte fue erróneo.' using errcode = 'P0001';
  end if;
  update public.worker_suspensions set lifted_at = now(), lifted_by = uid, lift_note = trim(p_note) where id = p_suspension;
  perform public._audit('admin.suspension_lift', 'worker_suspensions', p_suspension::text,
    jsonb_build_object('note', p_note, 'reporte_erroneo', p_reporte_erroneo));
  perform public._notify(s.worker_id, 'cuenta_reactivada', 'Tu cuenta fue reactivada', 'Ya puedes volver a postular.', '/trabajos');
end $$;

-- 4. Postular y aceptar con las nuevas reglas -----------------------------------
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
  if public.is_suspended(uid) then
    raise exception 'Tu cuenta está suspendida por no presentarte a un turno. Revisa el aviso en Mis postulaciones.' using errcode = 'P0001';
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
    raise exception 'Debes confirmar que tienes disponibilidad para el turno' using errcode = 'P0001';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Respuestas inválidas' using errcode = 'P0001';
  end if;
  select * into j from public.job_posts where id = p_job for update;
  if not found or not public.job_is_listed(j.status) then
    raise exception 'Esta publicación no está disponible' using errcode = 'P0002';
  end if;
  if j.starts_at <= now() or (j.apply_deadline is not null and j.apply_deadline <= now()) then
    raise exception 'El plazo para postular terminó' using errcode = 'P0001';
  end if;
  begin
    insert into public.applications (job_id, worker_id, message, highlighted_experience, availability_confirmed, cv_path)
    values (p_job, uid, nullif(trim(p_message), ''), nullif(trim(p_highlighted_experience), ''), true, cv)
    returning id into app_id;
  exception when unique_violation then
    raise exception 'Ya postulaste a este turno' using errcode = 'P0001';
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


-- respond_offer: se reemplaza para recibir la versión de la condición de asistencia.
drop function public.respond_offer(uuid, boolean, boolean, text);

create function public.respond_offer(p_offer uuid, p_accept boolean,
  p_availability_confirmed boolean default false, p_overlap_justification text default null,
  p_terms_version text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); o public.offers; j public.job_posts; bid uuid; trade text; com text;
begin
  select * into o from public.offers where id = p_offer for update;
  if not found or o.worker_id <> uid then raise exception 'Oferta no encontrada' using errcode = 'P0002'; end if;
  if o.status <> 'enviada' then raise exception 'Esta oferta ya fue respondida o retirada' using errcode = 'P0001'; end if;
  if o.expires_at <= now() then raise exception 'La oferta expiró' using errcode = 'P0001'; end if;
  select * into j from public.job_posts where id = o.job_id for update;

  if not p_accept then
    update public.offers set status = 'rechazada', responded_at = now() where id = p_offer;
    update public.applications set status = 'rechazada' where id = o.application_id;
    perform public._notify(o.business_id, 'oferta_rechazada', 'Oferta rechazada',
      format('El trabajador rechazó la oferta para "%s".', j.title), '/empresa/publicaciones/' || j.id);
    return null;
  end if;

  if p_availability_confirmed is not true then
    raise exception 'Debes confirmar tu disponibilidad antes de aceptar' using errcode = 'P0001';
  end if;
  if p_terms_version is null or length(trim(p_terms_version)) = 0 then
    raise exception 'Debes aceptar las condiciones de asistencia del turno' using errcode = 'P0001';
  end if;
  if public.is_suspended(uid) then
    raise exception 'Tu cuenta está suspendida: no puedes aceptar turnos hasta que sea reactivada' using errcode = 'P0001';
  end if;
  if j.status in ('cancelada','finalizada','vencida') or j.starts_at <= now() then
    raise exception 'La publicación ya no está disponible' using errcode = 'P0001';
  end if;
  if public._active_bookings(j.id) >= j.slots then
    raise exception 'Los cupos de esta publicación ya se completaron' using errcode = 'P0001';
  end if;

  select trade_name into trade from public.business_profiles where user_id = o.business_id;
  select name into com from public.comunas where id = j.comuna_id;
  begin
    insert into public.bookings (offer_id, job_id, application_id, worker_id, business_id, starts_at, ends_at,
                                 pay_type, pay_amount_clp, overlap_justification, terms_snapshot,
                                 worker_terms_version, worker_terms_accepted_at)
    values (o.id, j.id, o.application_id, uid, o.business_id, o.starts_at, o.ends_at, o.pay_type, o.pay_amount_clp,
            nullif(trim(p_overlap_justification), ''),
            jsonb_build_object(
              'titulo', j.title, 'empresa', trade, 'inicio', public._fmt_dt(o.starts_at), 'termino', public._fmt_dt(o.ends_at),
              'duracion_minutos', j.duration_minutes, 'tipo_pago', o.pay_type, 'monto_clp', o.pay_amount_clp,
              'total_estimado_clp', j.estimated_total_clp, 'modalidad', j.modality, 'comuna', com,
              'pausas', j.breaks_info, 'condiciones', j.conditions, 'vestimenta', j.attire,
              'alimentacion', j.food_info, 'transporte', j.transport_info,
              'modalidad_contratacion', j.engagement_mode, 'documento_tributario', j.tax_doc_info,
              'riesgo_laboral_orientativo', j.labor_risk, 'aceptada_en', public._fmt_dt(now())),
            left(trim(p_terms_version), 20), now())
    returning id into bid;
  exception when exclusion_violation then
    raise exception 'Ya tienes otro turno confirmado que se superpone con este horario. Si son compatibles, explica por qué.'
      using errcode = 'P0001';
  end;

  update public.offers set status = 'aceptada', responded_at = now() where id = p_offer;
  update public.applications set status = 'aceptada' where id = o.application_id;
  if public._active_bookings(j.id) >= j.slots then
    update public.job_posts set status = 'cubierta' where id = j.id;
  end if;
  perform public._audit('booking.create', 'bookings', bid::text,
    jsonb_build_object('job_id', j.id, 'overlap_justified', p_overlap_justification is not null));
  perform public._notify(o.business_id, 'oferta_aceptada', 'Turno confirmado',
    format('El trabajador aceptó "%s" (%s).', j.title, public._fmt_dt(o.starts_at)), '/contrataciones/' || bid);
  perform public._notify(uid, 'turno_confirmado', 'Turno confirmado',
    format('Confirmaste "%s" el %s. Revisa la dirección y condiciones.', j.title, public._fmt_dt(o.starts_at)),
    '/contrataciones/' || bid);
  return bid;
end $$;


-- 5. Permisos -------------------------------------------------------------------
revoke execute on function public.is_suspended(uuid), public.check_cv_owner(), public.report_no_show(uuid, text),
  public.submit_suspension_statement(uuid, text), public.admin_lift_suspension(uuid, text, boolean),
  public.respond_offer(uuid, boolean, boolean, text, text), public.apply_to_job(uuid, boolean, text, text, jsonb)
  from public, anon;
grant execute on function public.is_suspended(uuid), public.report_no_show(uuid, text),
  public.submit_suspension_statement(uuid, text), public.admin_lift_suspension(uuid, text, boolean),
  public.respond_offer(uuid, boolean, boolean, text, text), public.apply_to_job(uuid, boolean, text, text, jsonb)
  to authenticated;

-- 6. Almacenamiento del CV (solo en Supabase) ----------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('curriculums', 'curriculums', false, 5242880, array['application/pdf'])
    on conflict (id) do nothing;
    -- El trabajador sube y lee solo en su carpeta: <uid>/cv-<fecha>.pdf
    execute $p$ create policy "cv: subir propio" on storage.objects for insert to authenticated
      with check (bucket_id = 'curriculums' and (storage.foldername(name))[1] = auth.uid()::text) $p$;
    execute $p$ create policy "cv: leer propio o postulado" on storage.objects for select to authenticated
      using (bucket_id = 'curriculums' and (
        (storage.foldername(name))[1] = auth.uid()::text
        or exists (select 1 from public.applications a join public.job_posts j on j.id = a.job_id
                   where a.cv_path = name and j.business_id = auth.uid())
        or public.is_admin())) $p$;
  end if;
end $$;

-- >>>>> supabase/migrations/20261009001600_sin_inasistencias.sql
-- ============================================================================
-- TurnoExpress · Migración 16: sin gestión de inasistencias
-- La asistencia al turno es un asunto entre la empresa y el trabajador: la plataforma
-- no recibe reportes de inasistencia ni suspende cuentas por ese motivo.
-- Se quitan: worker_suspensions, report_no_show, submit_suspension_statement,
-- admin_lift_suspension, is_suspended y la condición de asistencia al aceptar un turno.
-- Se mantienen: datos personales, CV y su envío con cada postulación.
-- ============================================================================
set search_path = public, extensions;

-- 1. Postular ya no revisa suspensiones -------------------------------------------
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
    raise exception 'Debes confirmar que tienes disponibilidad para el turno' using errcode = 'P0001';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Respuestas inválidas' using errcode = 'P0001';
  end if;
  select * into j from public.job_posts where id = p_job for update;
  if not found or not public.job_is_listed(j.status) then
    raise exception 'Esta publicación no está disponible' using errcode = 'P0002';
  end if;
  if j.starts_at <= now() or (j.apply_deadline is not null and j.apply_deadline <= now()) then
    raise exception 'El plazo para postular terminó' using errcode = 'P0001';
  end if;
  begin
    insert into public.applications (job_id, worker_id, message, highlighted_experience, availability_confirmed, cv_path)
    values (p_job, uid, nullif(trim(p_message), ''), nullif(trim(p_highlighted_experience), ''), true, cv)
    returning id into app_id;
  exception when unique_violation then
    raise exception 'Ya postulaste a este turno' using errcode = 'P0001';
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


-- 2. Aceptar un turno vuelve a la firma original (sin condición de asistencia) ------
drop function public.respond_offer(uuid, boolean, boolean, text, text);

create function public.respond_offer(p_offer uuid, p_accept boolean,
  p_availability_confirmed boolean default false, p_overlap_justification text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); o public.offers; j public.job_posts; bid uuid; trade text; com text;
begin
  select * into o from public.offers where id = p_offer for update;
  if not found or o.worker_id <> uid then raise exception 'Oferta no encontrada' using errcode = 'P0002'; end if;
  if o.status <> 'enviada' then raise exception 'Esta oferta ya fue respondida o retirada' using errcode = 'P0001'; end if;
  if o.expires_at <= now() then raise exception 'La oferta expiró' using errcode = 'P0001'; end if;
  select * into j from public.job_posts where id = o.job_id for update;

  if not p_accept then
    update public.offers set status = 'rechazada', responded_at = now() where id = p_offer;
    update public.applications set status = 'rechazada' where id = o.application_id;
    perform public._notify(o.business_id, 'oferta_rechazada', 'Oferta rechazada',
      format('El trabajador rechazó la oferta para "%s".', j.title), '/empresa/publicaciones/' || j.id);
    return null;
  end if;

  if p_availability_confirmed is not true then
    raise exception 'Debes confirmar tu disponibilidad antes de aceptar' using errcode = 'P0001';
  end if;
  if j.status in ('cancelada','finalizada','vencida') or j.starts_at <= now() then
    raise exception 'La publicación ya no está disponible' using errcode = 'P0001';
  end if;
  if public._active_bookings(j.id) >= j.slots then
    raise exception 'Los cupos de esta publicación ya se completaron' using errcode = 'P0001';
  end if;

  select trade_name into trade from public.business_profiles where user_id = o.business_id;
  select name into com from public.comunas where id = j.comuna_id;
  begin
    insert into public.bookings (offer_id, job_id, application_id, worker_id, business_id, starts_at, ends_at,
                                 pay_type, pay_amount_clp, overlap_justification, terms_snapshot)
    values (o.id, j.id, o.application_id, uid, o.business_id, o.starts_at, o.ends_at, o.pay_type, o.pay_amount_clp,
            nullif(trim(p_overlap_justification), ''),
            jsonb_build_object(
              'titulo', j.title, 'empresa', trade, 'inicio', public._fmt_dt(o.starts_at), 'termino', public._fmt_dt(o.ends_at),
              'duracion_minutos', j.duration_minutes, 'tipo_pago', o.pay_type, 'monto_clp', o.pay_amount_clp,
              'total_estimado_clp', j.estimated_total_clp, 'modalidad', j.modality, 'comuna', com,
              'pausas', j.breaks_info, 'condiciones', j.conditions, 'vestimenta', j.attire,
              'alimentacion', j.food_info, 'transporte', j.transport_info,
              'modalidad_contratacion', j.engagement_mode, 'documento_tributario', j.tax_doc_info,
              'riesgo_laboral_orientativo', j.labor_risk, 'aceptada_en', public._fmt_dt(now())))
    returning id into bid;
  exception when exclusion_violation then
    raise exception 'Ya tienes otro turno confirmado que se superpone con este horario. Si son compatibles, explica por qué.'
      using errcode = 'P0001';
  end;

  update public.offers set status = 'aceptada', responded_at = now() where id = p_offer;
  update public.applications set status = 'aceptada' where id = o.application_id;
  if public._active_bookings(j.id) >= j.slots then
    update public.job_posts set status = 'cubierta' where id = j.id;
  end if;
  perform public._audit('booking.create', 'bookings', bid::text,
    jsonb_build_object('job_id', j.id, 'overlap_justified', p_overlap_justification is not null));
  perform public._notify(o.business_id, 'oferta_aceptada', 'Turno confirmado',
    format('El trabajador aceptó "%s" (%s).', j.title, public._fmt_dt(o.starts_at)), '/contrataciones/' || bid);
  perform public._notify(uid, 'turno_confirmado', 'Turno confirmado',
    format('Confirmaste "%s" el %s. Revisa la dirección y condiciones.', j.title, public._fmt_dt(o.starts_at)),
    '/contrataciones/' || bid);
  return bid;
end $$;

alter table public.bookings
  drop column if exists worker_terms_version,
  drop column if exists worker_terms_accepted_at;

-- 3. Se elimina la gestión de inasistencias ---------------------------------------
drop function if exists public.report_no_show(uuid, text);
drop function if exists public.submit_suspension_statement(uuid, text);
drop function if exists public.admin_lift_suspension(uuid, text, boolean);
drop function if exists public.is_suspended(uuid);
drop table if exists public.worker_suspensions;

-- 4. Permisos -----------------------------------------------------------------------
revoke execute on function public.respond_offer(uuid, boolean, boolean, text),
  public.apply_to_job(uuid, boolean, text, text, jsonb) from public, anon;
grant execute on function public.respond_offer(uuid, boolean, boolean, text),
  public.apply_to_job(uuid, boolean, text, text, jsonb) to authenticated;

-- >>>>> supabase/migrations/20261009001700_portal_de_ofertas.sql
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

notify pgrst, 'reload schema';
