-- ============================================================================
-- Migración 12: revisión solo cuando hace falta.
--  · Honorarios con 3+ indicios de relación laboral: ya NO bloquea. Se publica de inmediato,
--    queda marcado para revisión posterior (followup_*) y el trabajador ve un aviso de sus derechos.
--  · Siguen bloqueadas al instante las publicaciones que no cumplen las normas
--    (discriminación, contacto, cobros, multinivel, etc.).
--  · Sigue yendo a revisión previa el pago por hora inusualmente alto (señal de fraude).
-- ============================================================================
set search_path = public, extensions;

alter table public.job_posts
  add column followup_reason text,
  add column followup_status text check (followup_status is null or followup_status in ('pendiente', 'revisado')),
  add column followup_note   text,
  add constraint job_posts_followup_ok check ((followup_reason is null) = (followup_status is null));

create or replace function public.publish_job(p_job uuid) returns public.job_status
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); j public.job_posts; max_posts int; active_posts int;
        new_status public.job_status; problemas text[]; motivos text[] := '{}'; seguimiento text;
        independiente boolean;
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
  if j.hourly_equivalent_clp > 40000 then
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
    perform public._notify_admins('seguimiento_publicacion', 'Turno publicado para revisar después',
      format('"%s": %s.', j.title, seguimiento), '/admin/publicaciones/' || p_job);
  end if;
  return new_status;
end $$;


grant execute on function public.publish_job(uuid) to authenticated;
