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
