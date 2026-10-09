-- ============================================================================
-- Migración 7: datos legales de la empresa y preguntas del empleador.
--  · business_profiles: giro, dirección fiscal, representante legal, persona a cargo.
--  · No se puede publicar un turno si faltan datos de la empresa.
--  · job_questions: hasta 5 preguntas por turno (sí/no, opciones, respuesta corta),
--    con respuestas excluyentes ocultas para el trabajador.
--  · application_answers + applications.disqualified: el postulante que da una respuesta
--    excluyente queda marcado; NO se rechaza automáticamente, decide la empresa.
-- ============================================================================
set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Datos legales de la empresa
-- ---------------------------------------------------------------------------
alter table public.business_profiles
  add column giro             text check (giro is null or length(trim(giro)) between 3 and 150),
  add column fiscal_address   text check (fiscal_address is null or length(trim(fiscal_address)) between 5 and 200),
  add column legal_rep_name   text check (legal_rep_name is null or length(trim(legal_rep_name)) between 3 and 120),
  add column legal_rep_rut    text check (legal_rep_rut is null or public.rut_is_valid(legal_rep_rut)),
  add column contact_name     text check (contact_name is null or length(trim(contact_name)) between 3 and 120),
  add column contact_position text check (contact_position is null or length(trim(contact_position)) between 2 and 80);

comment on column public.business_profiles.comuna_id is 'Comuna de la dirección fiscal.';

grant insert (giro, fiscal_address, legal_rep_name, legal_rep_rut, contact_name, contact_position)
  on public.business_profiles to authenticated;
grant update (giro, fiscal_address, legal_rep_name, legal_rep_rut, contact_name, contact_position)
  on public.business_profiles to authenticated;

-- Lista de datos obligatorios que faltan (vacía = perfil completo).
create or replace function public.business_profile_missing(p_user uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_remove(array[
    case when b.user_id is null then 'perfil de empresa' end,
    case when b.rut is null then 'RUT de la empresa' end,
    case when b.legal_name is null then 'razón social' end,
    case when b.giro is null then 'giro' end,
    case when b.fiscal_address is null or b.comuna_id is null then 'dirección fiscal' end,
    case when b.legal_rep_name is null or b.legal_rep_rut is null then 'representante legal' end,
    case when b.contact_name is null or b.contact_phone is null then 'persona a cargo' end
  ], null), '{}')
  from (select p_user as uid) x
  left join public.business_profiles b on b.user_id = x.uid
$$;

create or replace function public.enforce_business_complete() returns trigger
language plpgsql security definer set search_path = public as $$
declare faltan text[];
begin
  if old.status = 'borrador' and new.status in ('publicada', 'en_revision') then
    faltan := public.business_profile_missing(new.business_id);
    if cardinality(faltan) > 0 then
      raise exception 'Completa los datos de tu empresa antes de publicar: %', array_to_string(faltan, ', ')
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger job_posts_business_complete before update of status on public.job_posts
  for each row execute function public.enforce_business_complete();

-- ---------------------------------------------------------------------------
-- 2. Preguntas del empleador
-- ---------------------------------------------------------------------------
create type public.question_kind as enum ('si_no', 'opcion', 'texto');

create table public.job_questions (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references public.job_posts(id) on delete cascade,
  position      smallint not null check (position between 1 and 5),
  prompt        text not null check (length(trim(prompt)) between 5 and 200),
  kind          public.question_kind not null,
  options       text[],
  required      boolean not null default true,
  disqualifying text[],          -- respuestas excluyentes (oculto para el trabajador)
  created_at    timestamptz not null default now(),
  unique (job_id, position),
  constraint job_questions_options_ok check (
    (kind = 'opcion' and cardinality(options) between 2 and 6
       and array_position(options, null) is null)
    or (kind <> 'opcion' and options is null)),
  constraint job_questions_disq_ok check (
    disqualifying is null
    or (kind = 'si_no' and disqualifying <@ array['si','no'] and cardinality(disqualifying) = 1)
    or (kind = 'opcion' and disqualifying <@ options and cardinality(disqualifying) between 1 and cardinality(options) - 1))
);
create index job_questions_job_idx on public.job_questions(job_id, position);

create or replace function public.is_draft_owner(p_job uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.job_posts where id = p_job and business_id = auth.uid() and status = 'borrador')
$$;

alter table public.job_questions enable row level security;
create policy questions_read on public.job_questions for select using (
  exists (select 1 from public.job_posts j where j.id = job_id)     -- hereda RLS de job_posts
);
create policy questions_insert on public.job_questions for insert with check (public.is_draft_owner(job_id));
create policy questions_delete on public.job_questions for delete using (public.is_draft_owner(job_id));

-- El trabajador nunca recibe la columna disqualifying.
grant select (id, job_id, position, prompt, kind, options, required) on public.job_questions to authenticated;
grant insert (job_id, position, prompt, kind, options, required, disqualifying) on public.job_questions to authenticated;
grant delete on public.job_questions to authenticated;

-- Preguntas completas (con excluyentes) sólo para la empresa dueña o administración.
create or replace function public.my_job_questions(p_job uuid) returns setof public.job_questions
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_job_owner(p_job) or public.is_admin()) then
    raise exception 'Publicación no encontrada' using errcode = 'P0002';
  end if;
  return query select * from public.job_questions where job_id = p_job order by position;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Respuestas de los postulantes
-- ---------------------------------------------------------------------------
alter table public.applications add column disqualified boolean not null default false;

create table public.application_answers (
  application_id uuid not null references public.applications(id) on delete cascade,
  question_id    uuid not null references public.job_questions(id) on delete cascade,
  answer         text not null check (length(trim(answer)) between 1 and 500),
  primary key (application_id, question_id)
);

alter table public.application_answers enable row level security;
create policy answers_read on public.application_answers for select using (
  exists (select 1 from public.applications a where a.id = application_id)   -- hereda RLS de applications
);
grant select on public.application_answers to authenticated;

-- Postular ahora recibe las respuestas: {"<question_id>": "si" | "no" | "<opción>" | "<texto>"}
drop function public.apply_to_job(uuid, boolean, text, text);

create function public.apply_to_job(p_job uuid, p_availability_confirmed boolean,
  p_message text default null, p_highlighted_experience text default null,
  p_answers jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_user(); j public.job_posts; app_id uuid;
        q public.job_questions; v text; descartado boolean := false;
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
    insert into public.applications (job_id, worker_id, message, highlighted_experience, availability_confirmed)
    values (p_job, uid, nullif(trim(p_message), ''), nullif(trim(p_highlighted_experience), ''), true)
    returning id into app_id;
  exception when unique_violation then
    raise exception 'Ya postulaste a este trabajo' using errcode = 'P0001';
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

-- ---------------------------------------------------------------------------
-- 4. Permisos de ejecución
-- ---------------------------------------------------------------------------
revoke execute on function public.business_profile_missing(uuid), public.enforce_business_complete(),
  public.is_draft_owner(uuid), public.my_job_questions(uuid),
  public.apply_to_job(uuid, boolean, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.is_draft_owner(uuid), public.my_job_questions(uuid),
  public.apply_to_job(uuid, boolean, text, text, jsonb) to authenticated;
