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
