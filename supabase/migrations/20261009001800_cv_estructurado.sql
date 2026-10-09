-- ============================================================================
-- TurnoExpress · Migración 18: CV estructurado del postulante
-- Titular, experiencias, formación, idiomas, habilidades y movilidad.
-- Lo ve el propio postulante, las empresas a cuyas ofertas postuló y administración
-- (misma regla que el perfil: can_view_worker). Solo el dueño escribe.
-- No se pide fecha de nacimiento: la edad no puede usarse para seleccionar.
-- ============================================================================
set search_path = public, extensions;

-- 1. Titular y movilidad ---------------------------------------------------------------
alter table public.worker_profiles
  add column headline     text check (headline is null or length(trim(headline)) between 2 and 80),
  add column can_travel   boolean not null default false,
  add column can_relocate boolean not null default false,
  add column has_vehicle  boolean not null default false;
grant insert (headline, can_travel, can_relocate, has_vehicle),
      update (headline, can_travel, can_relocate, has_vehicle) on public.worker_profiles to authenticated;

-- 2. Experiencia -------------------------------------------------------------------------
create table public.worker_experiences (
  id          uuid primary key default gen_random_uuid(),
  worker_id   uuid not null references public.worker_profiles(user_id) on delete cascade,
  position    text not null check (length(trim(position)) between 2 and 100),
  company     text not null check (length(trim(company)) between 2 and 120),
  description text check (description is null or length(description) <= 500),
  location    text check (location is null or length(location) <= 100),
  start_date  date not null check (start_date >= date '1950-01-01'),
  end_date    date,
  is_current  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (not is_current or end_date is null),
  check (end_date is null or end_date >= start_date),
  check (start_date <= current_date + 31)
);
create index worker_experiences_worker_idx on public.worker_experiences(worker_id, start_date desc);
create trigger worker_experiences_updated before update on public.worker_experiences
  for each row execute function public.set_updated_at();

-- 3. Formación ---------------------------------------------------------------------------
create table public.worker_education (
  id          uuid primary key default gen_random_uuid(),
  worker_id   uuid not null references public.worker_profiles(user_id) on delete cascade,
  institution text not null check (length(trim(institution)) between 2 and 150),
  title       text check (title is null or length(title) <= 150),
  level       text not null default 'otro'
              check (level in ('basica', 'media', 'tecnica', 'universitaria', 'postgrado', 'curso', 'otro')),
  start_date  date,
  end_date    date,
  is_current  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (not is_current or end_date is null),
  check (start_date is null or end_date is null or end_date >= start_date)
);
create index worker_education_worker_idx on public.worker_education(worker_id);
create trigger worker_education_updated before update on public.worker_education
  for each row execute function public.set_updated_at();

-- 4. Idiomas y habilidades -------------------------------------------------------------------
create table public.worker_languages (
  worker_id uuid not null references public.worker_profiles(user_id) on delete cascade,
  language  text not null check (length(trim(language)) between 2 and 40),
  level     text not null check (level in ('basico', 'intermedio', 'avanzado', 'nativo')),
  primary key (worker_id, language)
);

create table public.worker_skill_tags (
  worker_id uuid not null references public.worker_profiles(user_id) on delete cascade,
  tag       text not null check (length(trim(tag)) between 2 and 40),
  primary key (worker_id, tag)
);

-- 5. Límites por persona (evita abusos y listas interminables) ----------------------------------
create or replace function public.limit_cv_rows() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; maximo int := tg_argv[0]::int;
begin
  execute format('select count(*) from public.%I where worker_id = $1', tg_table_name) into n using new.worker_id;
  if n >= maximo then
    raise exception 'Puedes registrar hasta % elementos en esta sección', maximo using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger worker_experiences_limit before insert on public.worker_experiences
  for each row execute function public.limit_cv_rows('20');
create trigger worker_education_limit before insert on public.worker_education
  for each row execute function public.limit_cv_rows('10');
create trigger worker_languages_limit before insert on public.worker_languages
  for each row execute function public.limit_cv_rows('10');
create trigger worker_skill_tags_limit before insert on public.worker_skill_tags
  for each row execute function public.limit_cv_rows('30');

-- 6. Acceso ------------------------------------------------------------------------------------
alter table public.worker_experiences enable row level security;
alter table public.worker_education   enable row level security;
alter table public.worker_languages   enable row level security;
alter table public.worker_skill_tags  enable row level security;

create policy visible_read on public.worker_experiences for select using (public.can_view_worker(worker_id));
create policy own_insert   on public.worker_experiences for insert with check (worker_id = auth.uid());
create policy own_update   on public.worker_experiences for update using (worker_id = auth.uid()) with check (worker_id = auth.uid());
create policy own_delete   on public.worker_experiences for delete using (worker_id = auth.uid());

create policy visible_read on public.worker_education for select using (public.can_view_worker(worker_id));
create policy own_insert   on public.worker_education for insert with check (worker_id = auth.uid());
create policy own_update   on public.worker_education for update using (worker_id = auth.uid()) with check (worker_id = auth.uid());
create policy own_delete   on public.worker_education for delete using (worker_id = auth.uid());

create policy visible_read on public.worker_languages for select using (public.can_view_worker(worker_id));
create policy own_insert   on public.worker_languages for insert with check (worker_id = auth.uid());
create policy own_delete   on public.worker_languages for delete using (worker_id = auth.uid());

create policy visible_read on public.worker_skill_tags for select using (public.can_view_worker(worker_id));
create policy own_insert   on public.worker_skill_tags for insert with check (worker_id = auth.uid());
create policy own_delete   on public.worker_skill_tags for delete using (worker_id = auth.uid());

grant select, delete on public.worker_experiences, public.worker_education, public.worker_languages, public.worker_skill_tags
  to authenticated;
grant insert (worker_id, position, company, description, location, start_date, end_date, is_current),
      update (position, company, description, location, start_date, end_date, is_current)
  on public.worker_experiences to authenticated;
grant insert (worker_id, institution, title, level, start_date, end_date, is_current),
      update (institution, title, level, start_date, end_date, is_current)
  on public.worker_education to authenticated;
grant insert (worker_id, language, level) on public.worker_languages to authenticated;
grant insert (worker_id, tag) on public.worker_skill_tags to authenticated;

revoke execute on function public.limit_cv_rows() from public, anon, authenticated;
