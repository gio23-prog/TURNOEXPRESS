-- ============================================================================
-- Migración 4: lógica de negocio (RPC). Toda transición de estado pasa por aquí.
-- Códigos de error: P0001 regla de negocio · P0002 no encontrado · 42501 sin permiso · 28000 sin sesión
-- ============================================================================
set search_path = public, extensions;

alter table public.profiles add column is_demo boolean not null default false;
alter table public.comunas  add column lat numeric(9,6), add column lng numeric(9,6);
comment on column public.profiles.is_demo is 'Cuenta de demostración: excluida de las métricas reales.';
comment on column public.comunas.lat is 'Centroide aproximado. Pendiente de cargar desde fuente oficial.';

-- ---------------------------------------------------------------------------
-- Internas (no expuestas)
-- ---------------------------------------------------------------------------
create or replace function public._require_user() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); blocked boolean;
begin
  if uid is null then raise exception 'Debes iniciar sesión' using errcode = '28000'; end if;
  select is_blocked into blocked from public.profiles where id = uid;
  if blocked is null then raise exception 'Perfil no encontrado' using errcode = 'P0002'; end if;
  if blocked then raise exception 'Tu cuenta está suspendida. Contacta a soporte.' using errcode = '42501'; end if;
  return uid;
end $$;

create or replace function public._require_admin(min_level public.admin_level) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public._require_user();
begin
  if not public.is_admin(min_level) then
    raise exception 'No tienes permisos para esta acción' using errcode = '42501';
  end if;
  return uid;
end $$;

create or replace function public._notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, link) values (p_user, p_kind, p_title, p_body, p_link)
$$;

create or replace function public._notify_admins(p_kind text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, link)
  select user_id, p_kind, p_title, p_body, p_link from public.admin_roles where level >= 'moderador'
$$;

create or replace function public._audit(p_action text, p_entity text, p_id text, p_details jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (auth.uid(), p_action, p_entity, p_id, coalesce(p_details, '{}'::jsonb))
$$;

create or replace function public._setting_int(p_key text, p_default int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::int from public.platform_settings where key = p_key), p_default)
$$;

create or replace function public._fmt_dt(t timestamptz) returns text
language sql stable as $$ select to_char(t at time zone 'America/Santiago', 'DD/MM/YYYY HH24:MI') $$;

create or replace function public._ensure_conversation(p_app uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  select id into cid from public.conversations where application_id = p_app;
  if cid is null then
    insert into public.conversations (application_id, business_id, worker_id)
    select a.id, j.business_id, a.worker_id from public.applications a join public.job_posts j on j.id = a.job_id
    where a.id = p_app
    returning id into cid;
  end if;
  return cid;
end $$;

create or replace function public._active_bookings(p_job uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.bookings where job_id = p_job and status in ('confirmada','en_curso')
$$;

-- Cancela una publicación y todo lo que cuelga de ella, dejando registro.
create or replace function public._cancel_job(p_job uuid, p_actor uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare r record; t text;
begin
  select title into t from public.job_posts where id = p_job;
  update public.offers set status = 'retirada', responded_at = now()
   where job_id = p_job and status = 'enviada';
  for r in update public.applications set status = 'rechazada'
            where job_id = p_job and status in ('pendiente','en_revision','preseleccionada','oferta_enviada')
            returning worker_id loop
    perform public._notify(r.worker_id, 'publicacion_cancelada', 'Publicación cancelada',
      format('La publicación "%s" fue cancelada.', t), '/trabajador/postulaciones');
  end loop;
  for r in update public.bookings set status = 'cancelada', cancelled_at = now(), cancelled_by = p_actor,
              cancel_reason = 'Publicación cancelada: ' || p_reason
            where job_id = p_job and status = 'confirmada' returning id, worker_id, application_id loop
    update public.applications set status = 'rechazada' where id = r.application_id;
    perform public._notify(r.worker_id, 'contratacion_cancelada', 'Turno cancelado',
      format('Tu turno "%s" fue cancelado por la empresa. Motivo: %s', t, p_reason), '/contrataciones/' || r.id);
  end loop;
  update public.job_posts set status = 'cancelada', cancelled_at = now(), cancelled_by = p_actor,
         cancel_reason = p_reason where id = p_job;
end $$;

-- ---------------------------------------------------------------------------
-- Publicaciones
-- ---------------------------------------------------------------------------
create or replace function public.publish_job(p_job uuid) returns public.job_status
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); j public.job_posts; max_posts int; active_posts int;
        new_status public.job_status;
begin
  select * into j from public.job_posts where id = p_job for update;
  if not found or j.business_id <> uid then
    raise exception 'Publicación no encontrada' using errcode = 'P0002';
  end if;
  if j.status <> 'borrador' then
    raise exception 'Sólo se pueden publicar borradores' using errcode = 'P0001';
  end if;
  if j.starts_at <= now() + interval '30 minutes' then
    raise exception 'El turno debe comenzar al menos 30 minutos después de publicarlo' using errcode = 'P0001';
  end if;
  if j.apply_deadline is not null and j.apply_deadline <= now() then
    raise exception 'La fecha límite para postular ya pasó' using errcode = 'P0001';
  end if;
  if j.modality = 'presencial' and not exists (select 1 from public.job_post_private where job_id = p_job) then
    raise exception 'Debes indicar la dirección del servicio (se comparte sólo con quien contrates)' using errcode = 'P0001';
  end if;
  if j.labor_risk is null then
    raise exception 'Debes responder las preguntas sobre la modalidad de prestación' using errcode = 'P0001';
  end if;
  if j.labor_risk in ('medio','alto') and j.labor_warning_ack_at is null then
    raise exception 'Debes leer y confirmar la advertencia sobre la modalidad de contratación' using errcode = 'P0001';
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

  -- Riesgo alto declarado como prestación independiente -> revisión humana antes de publicar.
  new_status := case when j.labor_risk = 'alto' and j.engagement_mode <> 'relacion_laboral'
                     then 'en_revision' else 'publicada' end;
  update public.job_posts
     set status = new_status, published_at = case when new_status = 'publicada' then now() end
   where id = p_job;

  perform public._audit('job.publish', 'job_posts', p_job::text,
    jsonb_build_object('status', new_status, 'labor_risk', j.labor_risk, 'engagement_mode', j.engagement_mode));
  if new_status = 'en_revision' then
    perform public._notify_admins('revision_publicacion', 'Publicación en revisión',
      format('"%s" declara prestación independiente con indicadores de relación laboral.', j.title),
      '/admin/publicaciones/' || p_job);
  end if;
  return new_status;
end $$;

create or replace function public.cancel_job(p_job uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); j public.job_posts;
begin
  select * into j from public.job_posts where id = p_job for update;
  if not found or (j.business_id <> uid and not public.is_admin('moderador')) then
    raise exception 'Publicación no encontrada' using errcode = 'P0002';
  end if;
  if j.status in ('finalizada','cancelada','vencida','en_curso') then
    raise exception 'Esta publicación ya no se puede cancelar (estado: %)', j.status using errcode = 'P0001';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'Indica el motivo de la cancelación' using errcode = 'P0001';
  end if;
  perform public._cancel_job(p_job, uid, trim(p_reason));
  perform public._audit('job.cancel', 'job_posts', p_job::text, jsonb_build_object('reason', p_reason,
           'late', j.starts_at - now() < interval '24 hours', 'active_bookings', public._active_bookings(p_job)));
end $$;

-- ---------------------------------------------------------------------------
-- Postulaciones
-- ---------------------------------------------------------------------------
create or replace function public.apply_to_job(p_job uuid, p_availability_confirmed boolean,
  p_message text default null, p_highlighted_experience text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); j public.job_posts; app_id uuid;
begin
  if public.my_role() <> 'trabajador' then
    raise exception 'Sólo las cuentas de trabajador pueden postular' using errcode = '42501';
  end if;
  if not exists (select 1 from public.worker_profiles where user_id = uid) then
    raise exception 'Completa tu perfil antes de postular' using errcode = 'P0001';
  end if;
  if p_availability_confirmed is not true then
    raise exception 'Debes confirmar que tienes disponibilidad para el turno' using errcode = 'P0001';
  end if;
  select * into j from public.job_posts where id = p_job for update;
  if not found or not public.job_is_listed(j.status) then
    raise exception 'Esta publicación no está disponible' using errcode = 'P0002';
  end if;
  if j.starts_at <= now() or (j.apply_deadline is not null and j.apply_deadline <= now()) then
    raise exception 'El plazo para postular terminó' using errcode = 'P0001';
  end if;
  begin
    insert into public.applications (job_id, worker_id, message, highlighted_experience, availability_confirmed)
    values (p_job, uid, nullif(trim(p_message), ''), nullif(trim(p_highlighted_experience), ''), true)
    returning id into app_id;
  exception when unique_violation then
    raise exception 'Ya postulaste a este trabajo' using errcode = 'P0001';
  end;
  if j.status = 'publicada' then
    update public.job_posts set status = 'con_postulaciones' where id = p_job;
  end if;
  perform public._notify(j.business_id, 'nueva_postulacion', 'Nueva postulación',
    format('Recibiste una postulación para "%s".', j.title), '/empresa/publicaciones/' || p_job);
  return app_id;
end $$;

create or replace function public.withdraw_application(p_app uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); a public.applications; biz uuid;
begin
  select * into a from public.applications where id = p_app for update;
  if not found or a.worker_id <> uid then raise exception 'Postulación no encontrada' using errcode = 'P0002'; end if;
  if a.status not in ('pendiente','en_revision','preseleccionada','oferta_enviada') then
    raise exception 'No puedes retirar una postulación en estado %; si ya aceptaste, cancela la contratación', a.status
      using errcode = 'P0001';
  end if;
  update public.offers set status = 'retirada', responded_at = now() where application_id = p_app and status = 'enviada';
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
  if not ((a.status = 'pendiente'       and p_status in ('en_revision','preseleccionada','rechazada'))
       or (a.status = 'en_revision'     and p_status in ('preseleccionada','rechazada'))
       or (a.status = 'preseleccionada' and p_status in ('en_revision','rechazada'))) then
    raise exception 'Cambio de estado no permitido: % → %', a.status, p_status using errcode = 'P0001';
  end if;
  update public.applications set status = p_status where id = p_app;
  if p_status = 'preseleccionada' then
    perform public._ensure_conversation(p_app);
    perform public._notify(a.worker_id, 'preseleccion', '¡Fuiste preseleccionado!',
      format('La empresa te preseleccionó para "%s".', j.title), '/trabajador/postulaciones');
  elsif p_status = 'rechazada' then
    perform public._notify(a.worker_id, 'postulacion_rechazada', 'Postulación no seleccionada',
      format('Tu postulación a "%s" no fue seleccionada esta vez.', j.title), '/trabajador/postulaciones');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Ofertas y contratación
-- ---------------------------------------------------------------------------
create or replace function public.send_offer(p_app uuid, p_message text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); a public.applications; j public.job_posts; oid uuid; exp timestamptz;
begin
  select * into a from public.applications where id = p_app for update;
  if not found then raise exception 'Postulación no encontrada' using errcode = 'P0002'; end if;
  select * into j from public.job_posts where id = a.job_id for update;
  if j.business_id <> uid then raise exception 'Postulación no encontrada' using errcode = 'P0002'; end if;
  if a.status not in ('pendiente','en_revision','preseleccionada') then
    raise exception 'No se puede enviar una oferta a una postulación en estado %', a.status using errcode = 'P0001';
  end if;
  if not public.job_is_listed(j.status) or j.starts_at <= now() then
    raise exception 'La publicación ya no admite nuevas contrataciones' using errcode = 'P0001';
  end if;
  if public._active_bookings(j.id)
     + (select count(*) from public.offers where job_id = j.id and status = 'enviada') >= j.slots then
    raise exception 'Ya cubriste o tienes ofertas pendientes para todos los cupos (%)', j.slots using errcode = 'P0001';
  end if;
  exp := least(now() + make_interval(hours => public._setting_int('offer_expiry_hours', 12)), j.starts_at);
  insert into public.offers (application_id, job_id, worker_id, business_id, starts_at, ends_at,
                             pay_type, pay_amount_clp, message, expires_at)
  values (a.id, j.id, a.worker_id, uid, j.starts_at, j.ends_at, j.pay_type, j.pay_amount_clp,
          nullif(trim(p_message), ''), exp)
  returning id into oid;
  update public.applications set status = 'oferta_enviada' where id = a.id;
  perform public._ensure_conversation(a.id);
  perform public._notify(a.worker_id, 'oferta', 'Tienes una oferta',
    format('Oferta para "%s" el %s. Responde antes del %s.', j.title, public._fmt_dt(j.starts_at), public._fmt_dt(exp)),
    '/trabajador/ofertas/' || oid);
  return oid;
end $$;

create or replace function public.respond_offer(p_offer uuid, p_accept boolean,
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

create or replace function public.confirm_completion(p_booking uuid) returns public.booking_status
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); b public.bookings; other uuid;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found or uid not in (b.worker_id, b.business_id) then
    raise exception 'Contratación no encontrada' using errcode = 'P0002';
  end if;
  if b.status not in ('confirmada','en_curso') then
    raise exception 'No se puede confirmar la finalización en estado %', b.status using errcode = 'P0001';
  end if;
  if now() < b.starts_at then
    raise exception 'No puedes confirmar la finalización antes del inicio del turno' using errcode = 'P0001';
  end if;
  if uid = b.worker_id then
    update public.bookings set worker_done_at = coalesce(worker_done_at, now()) where id = p_booking returning * into b;
    other := b.business_id;
  else
    update public.bookings set business_done_at = coalesce(business_done_at, now()) where id = p_booking returning * into b;
    other := b.worker_id;
  end if;

  if b.worker_done_at is not null and b.business_done_at is not null then
    update public.bookings set status = 'finalizada', finished_at = now() where id = p_booking returning * into b;
    update public.applications set status = 'finalizada' where id = b.application_id;
    update public.job_posts set status = 'finalizada'
     where id = b.job_id and ends_at <= now()
       and not exists (select 1 from public.bookings x where x.job_id = b.job_id and x.status in ('confirmada','en_curso','incidencia'));
    perform public._notify(b.worker_id,   'servicio_finalizado', 'Servicio finalizado', 'Ya puedes dejar tu evaluación.', '/contrataciones/' || b.id);
    perform public._notify(b.business_id, 'servicio_finalizado', 'Servicio finalizado', 'Ya puedes dejar tu evaluación.', '/contrataciones/' || b.id);
  else
    if b.status = 'confirmada' then
      update public.bookings set status = 'en_curso' where id = p_booking returning * into b;
    end if;
    perform public._notify(other, 'confirmar_finalizacion', 'Confirma la finalización',
      'La otra parte indicó que el servicio terminó. Confírmalo o reporta una incidencia.', '/contrataciones/' || b.id);
  end if;
  return b.status;
end $$;

create or replace function public.cancel_booking(p_booking uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); b public.bookings; is_adm boolean := public.is_admin('moderador');
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found or (uid not in (b.worker_id, b.business_id) and not is_adm) then
    raise exception 'Contratación no encontrada' using errcode = 'P0002';
  end if;
  if b.status <> 'confirmada' then
    raise exception 'Sólo se pueden cancelar contrataciones confirmadas que no han comenzado (estado: %). Reporta una incidencia.',
      b.status using errcode = 'P0001';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'Indica el motivo de la cancelación' using errcode = 'P0001';
  end if;
  update public.bookings set status = 'cancelada', cancelled_at = now(), cancelled_by = uid, cancel_reason = trim(p_reason)
   where id = p_booking;
  update public.applications set status = case when uid = b.worker_id then 'retirada' else 'rechazada' end::public.application_status
   where id = b.application_id;
  update public.job_posts set status = 'con_postulaciones'
   where id = b.job_id and status = 'cubierta' and starts_at > now();
  perform public._audit('booking.cancel', 'bookings', p_booking::text, jsonb_build_object(
    'by', case when uid = b.worker_id then 'trabajador' when uid = b.business_id then 'empresa' else 'admin' end,
    'reason', p_reason, 'late', b.starts_at - now() < interval '24 hours'));
  if uid <> b.worker_id then
    perform public._notify(b.worker_id, 'contratacion_cancelada', 'Turno cancelado', 'Motivo: ' || p_reason, '/contrataciones/' || b.id);
  end if;
  if uid <> b.business_id then
    perform public._notify(b.business_id, 'contratacion_cancelada', 'Turno cancelado', 'Motivo: ' || p_reason, '/contrataciones/' || b.id);
  end if;
end $$;

create or replace function public.report_incident(p_booking uuid, p_reason text, p_details text) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); b public.bookings; rid uuid;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found or uid not in (b.worker_id, b.business_id) then
    raise exception 'Contratación no encontrada' using errcode = 'P0002';
  end if;
  if b.status = 'cancelada' then raise exception 'La contratación está cancelada' using errcode = 'P0001'; end if;
  insert into public.reports (reporter_id, target_type, target_id, reason, details)
  values (uid, 'contratacion', p_booking, p_reason, p_details) returning id into rid;
  if b.status in ('confirmada','en_curso') then
    update public.bookings set status = 'incidencia' where id = p_booking;
    update public.applications set status = 'incidencia_reportada' where id = b.application_id;
  end if;
  perform public._notify_admins('incidencia', 'Nueva incidencia', 'Se reportó una incidencia en una contratación.', '/admin/denuncias/' || rid);
  return rid;
end $$;

-- Cambios de horario/tarifa: propuesta + aceptación de la contraparte, con registro.
create or replace function public.propose_booking_change(p_booking uuid, p_reason text,
  p_new_starts_at timestamptz default null, p_new_ends_at timestamptz default null, p_new_pay_amount_clp int default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); b public.bookings; cid uuid;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found or uid not in (b.worker_id, b.business_id) then
    raise exception 'Contratación no encontrada' using errcode = 'P0002';
  end if;
  if b.status <> 'confirmada' then raise exception 'Sólo se pueden modificar turnos confirmados' using errcode = 'P0001'; end if;
  if p_new_starts_at is not null and (p_new_starts_at <= now() or p_new_ends_at - p_new_starts_at > interval '24 hours') then
    raise exception 'Horario propuesto inválido' using errcode = 'P0001';
  end if;
  begin
    insert into public.booking_change_requests (booking_id, proposed_by, new_starts_at, new_ends_at, new_pay_amount_clp, reason)
    values (p_booking, uid, p_new_starts_at, p_new_ends_at, p_new_pay_amount_clp, p_reason) returning id into cid;
  exception when unique_violation then
    raise exception 'Ya existe una propuesta de cambio pendiente' using errcode = 'P0001';
  end;
  perform public._notify(case when uid = b.worker_id then b.business_id else b.worker_id end,
    'cambio_propuesto', 'Propuesta de cambio', 'Se propuso un cambio de horario o tarifa. Debes aceptarlo o rechazarlo.',
    '/contrataciones/' || b.id);
  return cid;
end $$;

create or replace function public.respond_booking_change(p_change uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); c public.booking_change_requests; b public.bookings;
begin
  select * into c from public.booking_change_requests where id = p_change for update;
  if not found then raise exception 'Propuesta no encontrada' using errcode = 'P0002'; end if;
  select * into b from public.bookings where id = c.booking_id for update;
  if uid not in (b.worker_id, b.business_id) or uid = c.proposed_by then
    raise exception 'Sólo la contraparte puede responder la propuesta' using errcode = '42501';
  end if;
  if c.status <> 'pendiente' then raise exception 'La propuesta ya fue respondida' using errcode = 'P0001'; end if;
  if p_accept then
    if b.status <> 'confirmada' then raise exception 'La contratación ya no admite cambios' using errcode = 'P0001'; end if;
    begin
      update public.bookings set
        starts_at = coalesce(c.new_starts_at, starts_at), ends_at = coalesce(c.new_ends_at, ends_at),
        pay_amount_clp = coalesce(c.new_pay_amount_clp, pay_amount_clp),
        terms_snapshot = terms_snapshot || jsonb_build_object('modificada_en', public._fmt_dt(now()),
          'inicio', public._fmt_dt(coalesce(c.new_starts_at, starts_at)),
          'termino', public._fmt_dt(coalesce(c.new_ends_at, ends_at)),
          'monto_clp', coalesce(c.new_pay_amount_clp, pay_amount_clp))
      where id = b.id;
    exception when exclusion_violation then
      raise exception 'El nuevo horario se superpone con otro turno confirmado del trabajador' using errcode = 'P0001';
    end;
  end if;
  update public.booking_change_requests set status = case when p_accept then 'aceptado' else 'rechazado' end::public.change_status,
         responded_by = uid, responded_at = now() where id = p_change;
  perform public._audit('booking.change_' || case when p_accept then 'accepted' else 'rejected' end, 'bookings', b.id::text,
    jsonb_build_object('change_id', p_change, 'old_starts_at', b.starts_at, 'old_ends_at', b.ends_at, 'old_pay', b.pay_amount_clp,
                       'new_starts_at', c.new_starts_at, 'new_ends_at', c.new_ends_at, 'new_pay', c.new_pay_amount_clp));
  perform public._notify(c.proposed_by, 'cambio_respondido',
    case when p_accept then 'Cambio aceptado' else 'Cambio rechazado' end, null, '/contrataciones/' || b.id);
end $$;

-- ---------------------------------------------------------------------------
-- Evaluaciones
-- ---------------------------------------------------------------------------
create or replace function public.submit_review(p_booking uuid, p_rating int, p_comment text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); b public.bookings; rid uuid; target uuid;
begin
  select * into b from public.bookings where id = p_booking;
  if not found or uid not in (b.worker_id, b.business_id) then
    raise exception 'Contratación no encontrada' using errcode = 'P0002';
  end if;
  if b.status <> 'finalizada' then
    raise exception 'Sólo puedes evaluar servicios finalizados' using errcode = 'P0001';
  end if;
  if b.finished_at < now() - make_interval(days => public._setting_int('review_window_days', 30)) then
    raise exception 'El plazo para evaluar este servicio terminó' using errcode = 'P0001';
  end if;
  target := case when uid = b.worker_id then b.business_id else b.worker_id end;
  begin
    insert into public.reviews (booking_id, reviewer_id, reviewee_id, rating, comment)
    values (p_booking, uid, target, p_rating, nullif(trim(p_comment), '')) returning id into rid;
  exception when unique_violation then
    raise exception 'Ya evaluaste este servicio' using errcode = 'P0001';
  end;
  perform public._notify(target, 'nueva_resena', 'Recibiste una evaluación', null, '/perfil/evaluaciones');
  return rid;
end $$;

-- ---------------------------------------------------------------------------
-- Documentos tributarios (sólo registro de documentos emitidos fuera de la plataforma)
-- ---------------------------------------------------------------------------
create or replace function public.request_tax_document(p_booking uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); b public.bookings; did uuid;
begin
  select * into b from public.bookings where id = p_booking;
  if not found or b.business_id <> uid then raise exception 'Contratación no encontrada' using errcode = 'P0002'; end if;
  if b.status not in ('en_curso','finalizada','incidencia') then
    raise exception 'Sólo se puede solicitar el documento de un servicio iniciado o finalizado' using errcode = 'P0001';
  end if;
  insert into public.tax_documents (booking_id, worker_id, business_id, status)
  values (b.id, b.worker_id, b.business_id, 'solicitado')
  on conflict (booking_id, doc_type) do update set status = 'solicitado'
    where public.tax_documents.status = 'pendiente'
  returning id into did;
  perform public._notify(b.worker_id, 'documento_solicitado', 'Documento tributario solicitado',
    'La empresa solicitó el documento tributario del servicio. Revisa la guía si tienes dudas.', '/contrataciones/' || b.id);
  return did;
end $$;

create or replace function public.register_tax_document(p_booking uuid, p_status public.tax_doc_status,
  p_folio text default null, p_issued_on date default null, p_gross_amount_clp int default null,
  p_file_path text default null, p_notes text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); b public.bookings; did uuid;
begin
  select * into b from public.bookings where id = p_booking;
  if not found or b.worker_id <> uid then raise exception 'Contratación no encontrada' using errcode = 'P0002'; end if;
  if p_status = 'revisado' then
    raise exception 'Sólo la empresa puede marcar el documento como revisado' using errcode = '42501';
  end if;
  if p_issued_on is not null and (p_issued_on > (now() at time zone 'America/Santiago')::date
                                   or p_issued_on < (b.starts_at at time zone 'America/Santiago')::date - 1) then
    raise exception 'La fecha de emisión no es coherente con el servicio' using errcode = 'P0001';
  end if;
  if p_file_path is not null and p_file_path not like uid::text || '/%' then
    raise exception 'Ruta de archivo inválida' using errcode = '42501';
  end if;
  begin
    insert into public.tax_documents (booking_id, worker_id, business_id, status, folio, issued_on,
                                      gross_amount_clp, file_path, notes)
    values (b.id, uid, b.business_id, p_status, nullif(trim(p_folio), ''), p_issued_on, p_gross_amount_clp, p_file_path, p_notes)
    on conflict (booking_id, doc_type) do update set
      status = excluded.status, folio = excluded.folio, issued_on = excluded.issued_on,
      gross_amount_clp = excluded.gross_amount_clp, file_path = coalesce(excluded.file_path, public.tax_documents.file_path),
      notes = excluded.notes
    where public.tax_documents.status <> 'revisado'
    returning id into did;
  exception when check_violation then
    raise exception 'Para marcarlo como emitido debes informar folio y fecha de emisión' using errcode = 'P0001';
  end;
  if did is null then raise exception 'El documento ya fue revisado por la empresa' using errcode = 'P0001'; end if;
  if p_status = 'emitido' then
    perform public._notify(b.business_id, 'documento_emitido', 'Documento tributario registrado',
      'El prestador registró el folio del documento. Verifícalo en el SII y márcalo como revisado.', '/contrataciones/' || b.id);
  end if;
  return did;
end $$;

create or replace function public.mark_tax_document_reviewed(p_doc uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); d public.tax_documents;
begin
  select * into d from public.tax_documents where id = p_doc for update;
  if not found or d.business_id <> uid then raise exception 'Documento no encontrado' using errcode = 'P0002'; end if;
  if d.status <> 'emitido' then raise exception 'Sólo se pueden revisar documentos emitidos' using errcode = 'P0001'; end if;
  update public.tax_documents set status = 'revisado', reviewed_by = uid, reviewed_at = now() where id = p_doc;
end $$;

-- ---------------------------------------------------------------------------
-- Administración (todas las acciones quedan auditadas)
-- ---------------------------------------------------------------------------
create or replace function public.admin_review_job(p_job uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_admin('moderador'); j public.job_posts;
begin
  select * into j from public.job_posts where id = p_job for update;
  if not found or j.status <> 'en_revision' then
    raise exception 'La publicación no está en revisión' using errcode = 'P0001';
  end if;
  if p_note is null or length(trim(p_note)) < 5 then raise exception 'Agrega una nota de revisión' using errcode = 'P0001'; end if;
  if p_approve then
    update public.job_posts set status = 'publicada', published_at = now(), review_note = p_note where id = p_job;
  else
    update public.job_posts set review_note = p_note where id = p_job;
    perform public._cancel_job(p_job, uid, 'No aprobada en revisión: ' || p_note);
  end if;
  perform public._audit(case when p_approve then 'admin.job_approve' else 'admin.job_reject' end, 'job_posts', p_job::text,
                        jsonb_build_object('note', p_note));
  perform public._notify(j.business_id, 'revision_resultado',
    case when p_approve then 'Publicación aprobada' else 'Publicación no aprobada' end, p_note, '/empresa/publicaciones/' || p_job);
end $$;

create or replace function public.admin_suspend_job(p_job uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_admin('moderador'); j public.job_posts;
begin
  select * into j from public.job_posts where id = p_job for update;
  if not found or j.status in ('finalizada','cancelada','vencida') then
    raise exception 'La publicación no se puede suspender' using errcode = 'P0001';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 then raise exception 'Indica el motivo' using errcode = 'P0001'; end if;
  perform public._cancel_job(p_job, uid, 'Suspendida por administración: ' || p_reason);
  perform public._audit('admin.job_suspend', 'job_posts', p_job::text, jsonb_build_object('reason', p_reason));
  perform public._notify(j.business_id, 'publicacion_suspendida', 'Publicación suspendida', p_reason, '/empresa/publicaciones/' || p_job);
end $$;

create or replace function public.admin_set_user_block(p_user uuid, p_blocked boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_admin('moderador');
begin
  if p_user = uid then raise exception 'No puedes bloquear tu propia cuenta' using errcode = 'P0001'; end if;
  if p_blocked and (p_reason is null or length(trim(p_reason)) < 5) then
    raise exception 'Indica el motivo del bloqueo' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.admin_roles where user_id = p_user and level = 'superadmin') and not public.is_admin('superadmin') then
    raise exception 'No tienes permisos para bloquear a un superadministrador' using errcode = '42501';
  end if;
  update public.profiles set is_blocked = p_blocked, blocked_reason = case when p_blocked then p_reason end where id = p_user;
  if not found then raise exception 'Usuario no encontrado' using errcode = 'P0002'; end if;
  if p_blocked then  -- sus publicaciones visibles pasan a revisión
    update public.job_posts set status = 'en_revision', review_note = 'Cuenta suspendida: ' || p_reason
     where business_id = p_user and status in ('publicada','con_postulaciones');
  end if;
  perform public._audit(case when p_blocked then 'admin.user_block' else 'admin.user_unblock' end, 'profiles', p_user::text,
                        jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.admin_set_verification(p_user uuid, p_status public.verification_status, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_admin('moderador');
begin
  update public.business_profiles set verification_status = p_status,
         verified_at = case when p_status = 'verificado' then now() end,
         verified_by = case when p_status = 'verificado' then uid end
   where user_id = p_user;
  if not found then
    update public.worker_profiles set verification_status = p_status where user_id = p_user;
    if not found then raise exception 'Perfil no encontrado' using errcode = 'P0002'; end if;
  end if;
  perform public._audit('admin.verification', 'profiles', p_user::text, jsonb_build_object('status', p_status, 'note', p_note));
  perform public._notify(p_user, 'verificacion', 'Estado de verificación actualizado', p_note, '/configuracion');
end $$;

create or replace function public.admin_set_review_hidden(p_review uuid, p_hidden boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_admin('moderador');
begin
  if p_hidden and (p_reason is null or length(trim(p_reason)) < 5) then
    raise exception 'Indica el motivo' using errcode = 'P0001';
  end if;
  update public.reviews set is_hidden = p_hidden, hidden_reason = case when p_hidden then p_reason end where id = p_review;
  if not found then raise exception 'Reseña no encontrada' using errcode = 'P0002'; end if;
  perform public._audit(case when p_hidden then 'admin.review_hide' else 'admin.review_restore' end, 'reviews', p_review::text,
                        jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.admin_resolve_report(p_report uuid, p_status public.report_status, p_resolution text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_admin('soporte'); r public.reports;
begin
  select * into r from public.reports where id = p_report for update;
  if not found then raise exception 'Denuncia no encontrada' using errcode = 'P0002'; end if;
  if p_status in ('resuelta','descartada') and (p_resolution is null or length(trim(p_resolution)) < 5) then
    raise exception 'Describe la resolución' using errcode = 'P0001';
  end if;
  update public.reports set status = p_status, resolution = p_resolution,
         resolved_by = case when p_status in ('resuelta','descartada') then uid end,
         resolved_at = case when p_status in ('resuelta','descartada') then now() end
   where id = p_report;
  perform public._audit('admin.report_' || p_status, 'reports', p_report::text, jsonb_build_object('resolution', p_resolution));
  perform public._notify(r.reporter_id, 'denuncia_actualizada', 'Tu reporte fue actualizado', p_resolution, '/ayuda/reportes');
end $$;

create or replace function public.admin_set_role(p_user uuid, p_level public.admin_level) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_admin('superadmin');
begin
  if p_user = uid then raise exception 'No puedes cambiar tu propio rol' using errcode = 'P0001'; end if;
  if p_level is null then
    delete from public.admin_roles where user_id = p_user;
  else
    insert into public.admin_roles (user_id, level, granted_by) values (p_user, p_level, uid)
    on conflict (user_id) do update set level = excluded.level, granted_by = uid, granted_at = now();
  end if;
  perform public._audit('admin.set_role', 'admin_roles', p_user::text, jsonb_build_object('level', p_level));
end $$;

create or replace function public.admin_set_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_admin('superadmin'); old jsonb;
begin
  select value into old from public.platform_settings where key = p_key;
  insert into public.platform_settings (key, value, updated_by) values (p_key, p_value, uid)
  on conflict (key) do update set value = excluded.value, updated_by = uid, updated_at = now();
  perform public._audit('admin.setting', 'platform_settings', p_key, jsonb_build_object('old', old, 'new', p_value));
end $$;

-- Categorías: escritura directa sólo para moderadores, con auditoría por trigger.
grant insert (parent_id, name, slug, notes, active, sort_order) on public.categories to authenticated;
grant update (name, notes, active, sort_order) on public.categories to authenticated;
grant usage on sequence public.categories_id_seq to authenticated;
create policy admin_insert on public.categories for insert with check (public.is_admin('moderador'));
create policy admin_update on public.categories for update using (public.is_admin('moderador'));

create or replace function public.audit_category_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public._audit('admin.category_' || lower(tg_op), 'categories', new.id::text, to_jsonb(new));
  return new;
end $$;
create trigger categories_audit after insert or update on public.categories
  for each row execute function public.audit_category_change();

-- ---------------------------------------------------------------------------
-- Búsqueda de trabajos (sólo columnas públicas; nunca la dirección exacta)
-- ---------------------------------------------------------------------------
create or replace function public.search_jobs(
  p_category int default null, p_comunas int[] default null,
  p_date_from date default null, p_date_to date default null,
  p_quick text default null, p_min_hourly_clp int default null, p_max_hours numeric default null,
  p_text text default null, p_urgent_only boolean default false,
  p_lat numeric default null, p_lng numeric default null, p_max_km numeric default null,
  p_sort text default 'inicio', p_limit int default 20, p_offset int default 0)
returns table (
  id uuid, title text, category_id int, category text, parent_category text,
  business_id uuid, business_name text, business_verified boolean,
  comuna_id int, comuna text, approx_location text, modality public.work_modality,
  starts_at timestamptz, ends_at timestamptz, duration_minutes int,
  pay_type public.pay_type, pay_amount_clp int, hourly_equivalent_clp int, estimated_total_clp int,
  is_urgent boolean, slots smallint, applicants bigint, distance_km numeric, published_at timestamptz, total_count bigint)
language plpgsql stable security definer set search_path = public as $$
declare today date := (now() at time zone 'America/Santiago')::date; sat date;
begin
  if p_quick is not null and p_quick not in ('hoy','manana','finde','pocas_horas','un_dia','proyecto','cerca') then
    raise exception 'Filtro rápido inválido' using errcode = '22023';
  end if;
  sat := case when extract(isodow from today) = 7 then today - 1
              else today + (6 - extract(isodow from today)::int) end;
  return query
  with base as (
    select j.*, c.name as cat_name, pc.name as parent_name, bp.trade_name, (bp.verification_status = 'verificado') as verified,
           co.name as comuna_name,
           case when p_lat is not null and p_lng is not null and co.lat is not null then
             round((6371 * 2 * asin(sqrt(power(sin(radians(co.lat - p_lat) / 2), 2)
               + cos(radians(p_lat)) * cos(radians(co.lat)) * power(sin(radians(co.lng - p_lng) / 2), 2))))::numeric, 1)
           end as dist,
           (select count(*) from public.applications a where a.job_id = j.id
             and a.status not in ('retirada','rechazada')) as n_app,
           (j.starts_at at time zone 'America/Santiago')::date as local_date
    from public.job_posts j
    join public.categories c on c.id = j.category_id
    left join public.categories pc on pc.id = c.parent_id
    join public.business_profiles bp on bp.user_id = j.business_id
    join public.profiles pr on pr.id = j.business_id and not pr.is_blocked
    left join public.comunas co on co.id = j.comuna_id
    where public.job_is_listed(j.status)
      and j.starts_at > now()
      and (j.apply_deadline is null or j.apply_deadline > now())
  )
  select b.id, b.title, b.category_id, b.cat_name, b.parent_name, b.business_id, b.trade_name, b.verified,
         b.comuna_id, b.comuna_name, b.approx_location, b.modality, b.starts_at, b.ends_at, b.duration_minutes,
         b.pay_type, b.pay_amount_clp, b.hourly_equivalent_clp, b.estimated_total_clp, b.is_urgent, b.slots,
         b.n_app, b.dist, b.published_at, count(*) over ()
  from base b
  where (p_category is null or b.category_id = p_category
         or b.category_id in (select x.id from public.categories x where x.parent_id = p_category))
    and (p_comunas is null or b.comuna_id = any(p_comunas))
    and (p_date_from is null or b.local_date >= p_date_from)
    and (p_date_to is null or b.local_date <= p_date_to)
    and (p_min_hourly_clp is null or b.hourly_equivalent_clp >= p_min_hourly_clp)
    and (p_max_hours is null or b.duration_minutes <= p_max_hours * 60)
    and (not p_urgent_only or b.is_urgent)
    and (p_text is null or b.title ilike '%' || p_text || '%' or b.description ilike '%' || p_text || '%')
    and (p_max_km is null or b.dist <= p_max_km)
    and (p_quick is null
         or (p_quick = 'hoy' and b.local_date = today)
         or (p_quick = 'manana' and b.local_date = today + 1)
         or (p_quick = 'finde' and b.local_date between sat and sat + 1)
         or (p_quick = 'pocas_horas' and b.duration_minutes <= 240)
         or (p_quick = 'un_dia' and b.duration_minutes >= 360)
         or (p_quick = 'proyecto' and b.pay_type = 'total')
         or (p_quick = 'cerca' and b.dist is not null and b.dist <= coalesce(p_max_km, 5)))
  order by
    case when p_sort = 'recientes' then extract(epoch from b.published_at) end desc nulls last,
    case when p_sort = 'tarifa' then b.hourly_equivalent_clp end desc nulls last,
    case when p_sort = 'distancia' then b.dist end asc nulls last,
    b.is_urgent desc, b.starts_at asc
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
end $$;

-- Turnos confirmados del usuario que se superponen con una publicación (para advertir en la UI).
create or replace function public.my_overlapping_bookings(p_job uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select b.id from public.bookings b join public.job_posts j on j.id = p_job
  where b.worker_id = auth.uid() and b.status in ('confirmada','en_curso')
    and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(j.starts_at, j.ends_at, '[)')
$$;

-- ---------------------------------------------------------------------------
-- Mantenimiento por tiempo (ejecutar cada 5 min con pg_cron o un cron del servidor)
-- ---------------------------------------------------------------------------
create or replace function public.refresh_time_states() returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_off int; n_exp int; n_run int; n_jobrun int;
begin
  with x as (update public.offers set status = 'expirada' where status = 'enviada' and expires_at <= now()
             returning application_id)
  update public.applications a set status = 'preseleccionada' from x
   where a.id = x.application_id and a.status = 'oferta_enviada';
  get diagnostics n_off = row_count;

  update public.job_posts j set status = 'vencida'
   where j.status in ('publicada','con_postulaciones','en_revision')
     and (j.starts_at <= now() or (j.apply_deadline is not null and j.apply_deadline <= now()))
     and public._active_bookings(j.id) = 0;
  get diagnostics n_exp = row_count;

  update public.bookings set status = 'en_curso' where status = 'confirmada' and starts_at <= now();
  get diagnostics n_run = row_count;

  update public.job_posts j set status = 'en_curso'
   where j.status in ('cubierta','con_postulaciones','publicada') and j.starts_at <= now()
     and public._active_bookings(j.id) > 0;
  get diagnostics n_jobrun = row_count;

  return jsonb_build_object('ofertas_expiradas', n_off, 'publicaciones_vencidas', n_exp,
                            'contrataciones_en_curso', n_run, 'publicaciones_en_curso', n_jobrun);
end $$;

-- ---------------------------------------------------------------------------
-- Métricas (datos reales; las cuentas demo se excluyen salvo que se pidan)
-- ---------------------------------------------------------------------------
create or replace function public.admin_metrics(p_include_demo boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  perform public._require_admin('soporte');
  with u as (select * from public.profiles where p_include_demo or not is_demo),
       j as (select jp.* from public.job_posts jp join u on u.id = jp.business_id),
       pub as (select * from j where published_at is not null),
       b as (select bk.* from public.bookings bk join j on j.id = bk.job_id),
       first_app as (select a.job_id, min(a.created_at) as t from public.applications a group by a.job_id),
       first_book as (select bk.job_id, min(bk.created_at) as t from b bk group by bk.job_id)
  select jsonb_build_object(
    'incluye_demo', p_include_demo,
    'usuarios', (select count(*) from u),
    'empresas', (select count(*) from u where role = 'empresa'),
    'trabajadores', (select count(*) from u where role = 'trabajador'),
    'empresas_activas_30d', (select count(distinct business_id) from j where created_at > now() - interval '30 days'),
    'trabajadores_activos_30d', (select count(distinct a.worker_id) from public.applications a join u on u.id = a.worker_id
                                  where a.created_at > now() - interval '30 days'),
    'publicaciones_por_categoria', (select coalesce(jsonb_object_agg(cat, n), '{}'::jsonb) from (
        select coalesce(pc.name, c.name) as cat, count(*) as n from pub
        join public.categories c on c.id = pub.category_id left join public.categories pc on pc.id = c.parent_id
        group by 1) s),
    'publicadas_mismo_dia', (select count(*) from pub where (published_at at time zone 'America/Santiago')::date
                                                           = (starts_at at time zone 'America/Santiago')::date),
    'minutos_promedio_primera_postulacion', (select round(avg(extract(epoch from (fa.t - pub.published_at)) / 60)::numeric, 1)
                                             from pub join first_app fa on fa.job_id = pub.id),
    'minutos_promedio_hasta_cubrir', (select round(avg(extract(epoch from (fb.t - pub.published_at)) / 60)::numeric, 1)
                                      from pub join first_book fb on fb.job_id = pub.id),
    'pct_publicaciones_cubiertas', (select round(100.0 * count(*) filter (where exists
                                      (select 1 from b where b.job_id = pub.id and b.status <> 'cancelada'))
                                      / nullif(count(*), 0), 1) from pub),
    'pct_contrataciones_canceladas', (select round(100.0 * count(*) filter (where status = 'cancelada') / nullif(count(*), 0), 1) from b),
    'servicios_finalizados', (select count(*) from b where status = 'finalizada'),
    'pct_empresas_recurrentes', (select round(100.0 * count(*) filter (where n > 1) / nullif(count(*), 0), 1)
                                 from (select business_id, count(*) n from b where status = 'finalizada' group by 1) s),
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
    'publicaciones', count(distinct j.id),
    'publicaciones_activas', count(distinct j.id) filter (where j.status in ('publicada','con_postulaciones','en_revision','cubierta')),
    'postulaciones', (select count(*) from public.applications a join public.job_posts x on x.id = a.job_id where x.business_id = uid),
    'contrataciones', (select count(*) from public.bookings where business_id = uid and status <> 'cancelada'),
    'finalizadas', (select count(*) from public.bookings where business_id = uid and status = 'finalizada'))
  from public.job_posts j where j.business_id = uid);
end $$;

-- ---------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.rut_is_valid(text), public.rut_normalize(text),
  public.compute_labor_risk(boolean, boolean, boolean, boolean, boolean), public.job_is_listed(public.job_status),
  public.set_updated_at()
  to anon, authenticated;

grant execute on function public.search_jobs(int, int[], date, date, text, int, numeric, text, boolean, numeric, numeric, numeric, text, int, int)
  to anon, authenticated;

grant execute on function
  public.is_admin(public.admin_level), public.my_role(), public.is_job_owner(uuid), public.has_applied(uuid),
  public.has_active_booking_on_job(uuid), public.can_view_worker(uuid),
  public.publish_job(uuid), public.cancel_job(uuid, text),
  public.apply_to_job(uuid, boolean, text, text), public.withdraw_application(uuid),
  public.set_application_status(uuid, public.application_status),
  public.send_offer(uuid, text), public.respond_offer(uuid, boolean, boolean, text),
  public.confirm_completion(uuid), public.cancel_booking(uuid, text), public.report_incident(uuid, text, text),
  public.propose_booking_change(uuid, text, timestamptz, timestamptz, int), public.respond_booking_change(uuid, boolean),
  public.submit_review(uuid, int, text),
  public.request_tax_document(uuid),
  public.register_tax_document(uuid, public.tax_doc_status, text, date, int, text, text),
  public.mark_tax_document_reviewed(uuid),
  public.admin_review_job(uuid, boolean, text), public.admin_suspend_job(uuid, text),
  public.admin_set_user_block(uuid, boolean, text), public.admin_set_verification(uuid, public.verification_status, text),
  public.admin_set_review_hidden(uuid, boolean, text), public.admin_resolve_report(uuid, public.report_status, text),
  public.admin_set_role(uuid, public.admin_level), public.admin_set_setting(text, jsonb),
  public.admin_metrics(boolean), public.business_metrics(), public.my_overlapping_bookings(uuid)
  to authenticated;

grant execute on function public.refresh_time_states() to service_role;
