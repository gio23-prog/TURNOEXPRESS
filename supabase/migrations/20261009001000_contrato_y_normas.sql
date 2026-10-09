-- ============================================================================
-- Migración 10: tipo de contrato y normas de publicación.
--  · contract_type: plazo fijo, por obra o faena, indefinido u honorarios.
--    Con contrato de trabajo se publica sin cuestionario de modalidad.
--    Con honorarios se exige el cuestionario y, con 3+ indicios, revisión.
--  · Normas de publicación (inspiradas en los portales de empleo): se rechazan
--    datos de contacto, cobros al trabajador, esquemas multinivel, pago solo por
--    comisión, contenido discriminatorio y títulos en mayúsculas o genéricos.
--  · Pago por hora inusualmente alto → revisión.
--  Las mismas reglas están en lib/reglas-publicacion.ts para avisar en el formulario;
--  si cambias una, cambia la otra.
-- ============================================================================
set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Tipo de contrato
-- ---------------------------------------------------------------------------
alter table public.job_posts
  add column contract_type text check (contract_type is null or contract_type in ('plazo_fijo', 'por_obra', 'indefinido', 'honorarios'));

grant insert (contract_type) on public.job_posts to authenticated;
grant update (contract_type) on public.job_posts to authenticated;

-- engagement_mode se deriva del tipo de contrato para mantener una sola fuente de verdad.
create or replace function public.sync_engagement_mode() returns trigger
language plpgsql as $$
begin
  if new.contract_type is not null then
    new.engagement_mode := case when new.contract_type = 'honorarios'
                                then 'prestacion_independiente' else 'relacion_laboral' end::public.engagement_mode;
  end if;
  return new;
end $$;
create trigger job_posts_sync_engagement before insert or update of contract_type, engagement_mode on public.job_posts
  for each row execute function public.sync_engagement_mode();

-- ---------------------------------------------------------------------------
-- 2. Normas de publicación
-- ---------------------------------------------------------------------------
create or replace function public.job_content_issues(p_job uuid) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare j public.job_posts; t text; titulo_letras text; titulo_util text; issues text[] := '{}';
begin
  select * into j from public.job_posts where id = p_job;
  if not found then return array['Publicación no encontrada']; end if;

  t := concat_ws(' ', j.title, j.description, j.approx_location, j.breaks_info, j.conditions, j.experience_required,
                 j.certifications_required, j.attire, j.food_info, j.transport_info, j.additional_requirements, j.tax_doc_info,
                 (select string_agg(concat_ws(' ', q.prompt, array_to_string(q.options, ' ')), ' ')
                    from public.job_questions q where q.job_id = p_job));

  if t ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
     or t ~* '(https?://|www\.)'
     or t ~* '\m[a-z0-9-]+\.(cl|com|net|org|io|app|link|ly|me)\M'
     or t ~* '(\+?56[ .-]?)?\m9[ .-]?[0-9]{4}[ .-]?[0-9]{4}\M'
     or t ~* '\m(whatsapp|whatsap|wsp|wasap|telegram)\M' then
    issues := array_append(issues, 'datos de contacto (teléfono, correo, enlace o WhatsApp)');
  end if;
  if t ~* '(debes|deberás|deberas|tienes que|hay que|se debe)[[:space:]]+(pagar|cancelar|depositar|transferir|comprar)'
     or t ~* '(costo|valor|precio|pago)[[:space:]]+de[[:space:]]+(la[[:space:]]+)?(inscripci[oó]n|matr[ií]cula|curso|capacitaci[oó]n|credencial|kit)'
     or t ~* 'inversi[oó]n[[:space:]]+inicial' then
    issues := array_append(issues, 'cobros al trabajador');
  end if;
  if t ~* '(multinivel|piramidal|oportunidad de negocio|network marketing|ingresos ilimitados|s[eé] tu propio jefe)' then
    issues := array_append(issues, 'esquemas multinivel u oportunidades de negocio');
  end if;
  if t ~* '(s[oó]lo|solamente|[uú]nicamente)[[:space:]]+(por[[:space:]]+)?comisi[oó]n' or t ~* 'sin sueldo (base|fijo)' then
    issues := array_append(issues, 'pago solo por comisión');
  end if;
  if t ~* '(buena presencia|sexo (masculino|femenino)|estado civil|sin hijos|no embarazada|religi[oó]n)'
     or t ~* 's[oó]lo[[:space:]]+(hombres|mujeres|varones|damas|se[nñ]oritas|chilen[oa]s)'
     or t ~* 'edad[[:space:]]+(entre|m[aá]xima|m[ií]nima)'
     or t ~* '(menor|mayor)(es)?[[:space:]]+de[[:space:]]+[2-9][0-9][[:space:]]+a[nñ]os' then
    issues := array_append(issues, 'requisitos discriminatorios (edad, sexo, apariencia, situación familiar, religión o nacionalidad)');
  end if;

  titulo_letras := regexp_replace(j.title, '[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]', '', 'g');
  if length(titulo_letras) >= 6 and titulo_letras = upper(titulo_letras) then
    issues := array_append(issues, 'título en mayúsculas');
  end if;
  titulo_util := trim(regexp_replace(lower(j.title),
    '\m(se|necesita|necesito|necesitamos|busca|busco|buscamos|urgente|hoy|ya|para|de|un|una|por|favor|oferta|trabajo|empleo|pega|turno|turnos|personal|gente)\M|[^a-záéíóúüñ ]',
    '', 'g'));
  if titulo_util = '' then
    issues := array_append(issues, 'título genérico (indica el puesto, por ejemplo "Garzón para evento")');
  end if;
  return issues;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Publicar con las nuevas reglas
-- ---------------------------------------------------------------------------
create or replace function public.publish_job(p_job uuid) returns public.job_status
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); j public.job_posts; max_posts int; active_posts int;
        new_status public.job_status; problemas text[]; motivos text[] := '{}';
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

  if independiente and j.labor_risk = 'alto' then
    motivos := array_append(motivos, 'honorarios con indicios de relación laboral');
  end if;
  if j.hourly_equivalent_clp > 40000 then
    motivos := array_append(motivos, 'pago por hora inusualmente alto');
  end if;

  new_status := case when cardinality(motivos) > 0 then 'en_revision' else 'publicada' end;
  update public.job_posts
     set status = new_status,
         published_at = case when new_status = 'publicada' then now() end,
         review_note = case when new_status = 'en_revision' then 'Revisión automática: ' || array_to_string(motivos, '; ') end
   where id = p_job;

  perform public._audit('job.publish', 'job_posts', p_job::text,
    jsonb_build_object('status', new_status, 'labor_risk', j.labor_risk, 'contract_type', j.contract_type,
                       'engagement_mode', j.engagement_mode, 'motivos', motivos));
  if new_status = 'en_revision' then
    perform public._notify_admins('revision_publicacion', 'Publicación en revisión',
      format('"%s": %s.', j.title, array_to_string(motivos, '; ')), '/admin/publicaciones/' || p_job);
  end if;
  return new_status;
end $$;

revoke execute on function public.job_content_issues(uuid), public.sync_engagement_mode() from public, anon, authenticated;
grant execute on function public.publish_job(uuid) to authenticated;
