-- TurnoExpress: instalación completa para Supabase (SQL Editor).
-- Generado juntando supabase/migrations/*.sql en orden. Ejecútalo UNA sola vez en un proyecto nuevo.
-- Si ya instalaste una versión anterior, ejecuta solo las migraciones nuevas.


-- >>>>> supabase/migrations/20261004000100_base.sql
-- ============================================================================
-- TurnoExpress (nombre provisional) · Migración 1: base
-- Extensiones, tipos enumerados, utilidades y catálogos de referencia.
-- ============================================================================
create extension if not exists btree_gist with schema extensions;
create extension if not exists pgcrypto with schema extensions;

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.user_role           as enum ('trabajador','empresa');
create type public.admin_level         as enum ('soporte','moderador','superadmin');
create type public.verification_status as enum ('no_verificado','pendiente','verificado','rechazado');
create type public.job_status          as enum ('borrador','publicada','en_revision','con_postulaciones',
                                                'cubierta','en_curso','finalizada','cancelada','vencida');
create type public.application_status  as enum ('pendiente','en_revision','preseleccionada','oferta_enviada',
                                                'aceptada','rechazada','retirada','finalizada','incidencia_reportada');
create type public.offer_status        as enum ('enviada','aceptada','rechazada','expirada','retirada');
create type public.booking_status      as enum ('confirmada','en_curso','finalizada','cancelada','incidencia');
create type public.pay_type            as enum ('total','por_hora');
create type public.rate_unit           as enum ('hora','turno','dia','servicio');
create type public.work_modality       as enum ('presencial','remoto');
create type public.engagement_mode     as enum ('prestacion_independiente','relacion_laboral','por_definir');
create type public.labor_risk          as enum ('bajo','medio','alto');
create type public.tax_doc_status      as enum ('pendiente','solicitado','emitido','revisado');
create type public.report_status       as enum ('abierta','en_revision','resuelta','descartada');
create type public.report_target       as enum ('usuario','publicacion','contratacion','resena','mensaje');
create type public.change_status       as enum ('pendiente','aceptado','rechazado');

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Validación de RUT chileno (módulo 11). Acepta con o sin puntos/guion.
create or replace function public.rut_is_valid(p text) returns boolean
language plpgsql immutable as $$
declare
  clean text; body text; dv text; s int := 0; m int := 2; i int; r int; expected text;
begin
  if p is null then return false; end if;
  clean := upper(regexp_replace(p, '[^0-9kK]', '', 'g'));
  if length(clean) < 2 or length(clean) > 9 then return false; end if;
  body := left(clean, length(clean) - 1);
  dv := right(clean, 1);
  if body !~ '^[0-9]+$' then return false; end if;
  for i in reverse length(body)..1 loop
    s := s + substr(body, i, 1)::int * m;
    m := case when m = 7 then 2 else m + 1 end;
  end loop;
  r := 11 - (s % 11);
  expected := case r when 11 then '0' when 10 then 'K' else r::text end;
  return dv = expected;
end $$;

-- Normaliza a formato 12345678-9 (sin puntos)
create or replace function public.rut_normalize(p text) returns text
language sql immutable as $$
  select case when p is null then null else
    left(upper(regexp_replace(p, '[^0-9kK]', '', 'g')), length(regexp_replace(p, '[^0-9kK]', '', 'g')) - 1)
    || '-' || right(upper(regexp_replace(p, '[^0-9kK]', '', 'g')), 1) end
$$;

-- Riesgo de relación laboral a partir del cuestionario orientativo.
-- NO es un dictamen jurídico: sólo gatilla advertencias y revisión.
create or replace function public.compute_labor_risk(
  autonomy boolean, direct_supervision boolean, imposed_schedule boolean,
  continuous_instructions boolean, core_recurring boolean
) returns public.labor_risk
language sql immutable as $$
  select case
    when autonomy is null or direct_supervision is null or imposed_schedule is null
      or continuous_instructions is null or core_recurring is null then null
    else (case
      when ((not autonomy)::int + direct_supervision::int + imposed_schedule::int
            + continuous_instructions::int + core_recurring::int) >= 3 then 'alto'
      when ((not autonomy)::int + direct_supervision::int + imposed_schedule::int
            + continuous_instructions::int + core_recurring::int) = 2 then 'medio'
      else 'bajo' end)::public.labor_risk
  end
$$;

-- ---------------------------------------------------------------------------
-- Catálogos geográficos
-- ---------------------------------------------------------------------------
create table public.regions (
  id         smallint primary key,
  name       text not null unique,
  active     boolean not null default false
);

create table public.comunas (
  id         serial primary key,
  region_id  smallint not null references public.regions(id),
  name       text not null,
  active     boolean not null default true,
  unique (region_id, name)
);
create index comunas_region_idx on public.comunas(region_id);

insert into public.regions (id, name, active) values
  (13, 'Región Metropolitana de Santiago', true);

insert into public.comunas (region_id, name) values
  (13,'Alhué'),(13,'Buin'),(13,'Calera de Tango'),(13,'Cerrillos'),(13,'Cerro Navia'),(13,'Colina'),
  (13,'Conchalí'),(13,'Curacaví'),(13,'El Bosque'),(13,'El Monte'),(13,'Estación Central'),(13,'Huechuraba'),
  (13,'Independencia'),(13,'Isla de Maipo'),(13,'La Cisterna'),(13,'La Florida'),(13,'La Granja'),(13,'La Pintana'),
  (13,'La Reina'),(13,'Lampa'),(13,'Las Condes'),(13,'Lo Barnechea'),(13,'Lo Espejo'),(13,'Lo Prado'),
  (13,'Macul'),(13,'Maipú'),(13,'María Pinto'),(13,'Melipilla'),(13,'Ñuñoa'),(13,'Padre Hurtado'),
  (13,'Paine'),(13,'Pedro Aguirre Cerda'),(13,'Peñaflor'),(13,'Peñalolén'),(13,'Pirque'),(13,'Providencia'),
  (13,'Pudahuel'),(13,'Puente Alto'),(13,'Quilicura'),(13,'Quinta Normal'),(13,'Recoleta'),(13,'Renca'),
  (13,'San Bernardo'),(13,'San Joaquín'),(13,'San José de Maipo'),(13,'San Miguel'),(13,'San Pedro'),
  (13,'San Ramón'),(13,'Santiago'),(13,'Talagante'),(13,'Tiltil'),(13,'Vitacura');

-- ---------------------------------------------------------------------------
-- Categorías (jerárquicas: parent_id null = categoría; si no, subcategoría)
-- ---------------------------------------------------------------------------
create table public.categories (
  id         serial primary key,
  parent_id  int references public.categories(id) on delete restrict,
  name       text not null check (length(trim(name)) between 2 and 80),
  slug       text not null unique check (slug ~ '^[a-z0-9-]+$'),
  notes      text,
  active     boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (parent_id, name)
);
create index categories_parent_idx on public.categories(parent_id);
create trigger categories_updated before update on public.categories
  for each row execute function public.set_updated_at();

with c as (
  insert into public.categories (name, slug, sort_order) values
    ('Gastronomía','gastronomia',1),('Eventos','eventos',2),('Comercio','comercio',3),
    ('Logística','logistica',4),('Aseo y mantenimiento','aseo-mantenimiento',5),
    ('Administración','administracion',6),('Servicios y oficios','servicios-oficios',7)
  returning id, slug
)
insert into public.categories (parent_id, name, slug, notes)
select c.id, s.name, s.slug, s.notes from c join (values
  ('gastronomia','Garzón o garzona','garzon',null),('gastronomia','Bartender','bartender',null),
  ('gastronomia','Barista','barista',null),('gastronomia','Ayudante de cocina','ayudante-cocina',null),
  ('gastronomia','Maestro de cocina','maestro-cocina',null),('gastronomia','Copero','copero',null),
  ('gastronomia','Runner','runner',null),('gastronomia','Personal de banquetería','banqueteria',null),
  ('eventos','Promotor o promotora','promotor',null),('eventos','Anfitrión o anfitriona','anfitrion',null),
  ('eventos','Montaje y desmontaje','montaje',null),('eventos','Personal de acreditación','acreditacion',null),
  ('eventos','Asistente de producción','asistente-produccion',null),
  ('comercio','Vendedor o vendedora','vendedor',null),('comercio','Reponedor','reponedor',null),
  ('comercio','Cajero','cajero',null),('comercio','Apoyo de inventario','apoyo-inventario',null),
  ('comercio','Empaque y preparación de pedidos','empaque-pedidos',null),
  ('logistica','Operario de bodega','operario-bodega',null),('logistica','Preparación de pedidos','picking',null),
  ('logistica','Carga y descarga','carga-descarga',null),('logistica','Apoyo en despachos','apoyo-despachos',null),
  ('aseo-mantenimiento','Aseo de oficinas','aseo-oficinas',null),('aseo-mantenimiento','Aseo comercial','aseo-comercial',null),
  ('aseo-mantenimiento','Limpieza para eventos','limpieza-eventos',null),
  ('aseo-mantenimiento','Apoyo de mantenimiento','apoyo-mantenimiento',null),
  ('administracion','Digitación','digitacion',null),('administracion','Ingreso de datos','ingreso-datos',null),
  ('administracion','Apoyo administrativo','apoyo-administrativo',null),
  ('administracion','Asistencia en tareas puntuales','tareas-puntuales',null),
  ('servicios-oficios','Jardinería','jardineria',null),('servicios-oficios','Ayudante de mudanza','ayudante-mudanza',null),
  ('servicios-oficios','Armado de muebles','armado-muebles',null),
  ('servicios-oficios','Apoyo en instalaciones','apoyo-instalaciones',
   'Sujeto a las competencias y autorizaciones requeridas (p. ej. instalaciones eléctricas o de gas exigen autorización SEC).')
) as s(parent_slug, name, slug, notes) on s.parent_slug = c.slug;

create table public.skills (
  id          serial primary key,
  name        text not null unique check (length(trim(name)) between 2 and 60),
  category_id int references public.categories(id),
  active      boolean not null default true
);

-- >>>>> supabase/migrations/20261004000200_core.sql
-- ============================================================================
-- Migración 2: tablas principales
-- ============================================================================
set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Usuarios y perfiles
-- ---------------------------------------------------------------------------
-- Datos personales privados: sólo visibles para el propio usuario y administración.
create table public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  role                public.user_role not null,
  full_name           text not null check (length(trim(full_name)) between 2 and 120),
  phone               text check (phone is null or phone ~ '^\+56[0-9]{9}$'),
  rut                 text check (rut is null or public.rut_is_valid(rut)),
  terms_accepted_at   timestamptz not null,
  privacy_accepted_at timestamptz not null,
  is_blocked          boolean not null default false,
  blocked_reason      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index profiles_rut_uq on public.profiles(rut) where rut is not null;
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Permisos administrativos diferenciados (nunca auto-asignables).
create table public.admin_roles (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  level      public.admin_level not null,
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now()
);

create table public.business_profiles (
  user_id             uuid primary key references public.profiles(id) on delete cascade,
  trade_name          text not null check (length(trim(trade_name)) between 2 and 120),
  legal_name          text check (legal_name is null or length(trim(legal_name)) between 2 and 160),
  rut                 text check (rut is null or public.rut_is_valid(rut)),
  business_type       text check (business_type is null or length(business_type) <= 60),
  description         text check (description is null or length(description) <= 1500),
  contact_email       text check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_phone       text check (contact_phone is null or contact_phone ~ '^\+56[0-9]{9}$'),
  comuna_id           int references public.comunas(id),
  verification_status public.verification_status not null default 'no_verificado',
  verified_at         timestamptz,
  verified_by         uuid references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index business_rut_uq on public.business_profiles(rut) where rut is not null;
create trigger business_profiles_updated before update on public.business_profiles
  for each row execute function public.set_updated_at();

create table public.worker_profiles (
  user_id             uuid primary key references public.profiles(id) on delete cascade,
  display_name        text not null check (length(trim(display_name)) between 2 and 60),
  bio                 text check (bio is null or length(bio) <= 1000),
  photo_path          text,
  experience_summary  text check (experience_summary is null or length(experience_summary) <= 2000),
  years_experience    smallint check (years_experience is null or years_experience between 0 and 60),
  rate_unit           public.rate_unit,
  rate_amount_clp     int check (rate_amount_clp is null or rate_amount_clp between 1 and 10000000),
  can_issue_boleta    boolean not null default false,
  is_public           boolean not null default true,
  verification_status public.verification_status not null default 'no_verificado',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check ((rate_unit is null) = (rate_amount_clp is null))
);
create trigger worker_profiles_updated before update on public.worker_profiles
  for each row execute function public.set_updated_at();

create table public.worker_categories (
  worker_id   uuid references public.worker_profiles(user_id) on delete cascade,
  category_id int  references public.categories(id) on delete cascade,
  primary key (worker_id, category_id)
);
create index worker_categories_cat_idx on public.worker_categories(category_id);

create table public.worker_skills (
  worker_id uuid references public.worker_profiles(user_id) on delete cascade,
  skill_id  int  references public.skills(id) on delete cascade,
  primary key (worker_id, skill_id)
);

-- weekday: ISO 1 = lunes … 7 = domingo. Si end_time < start_time el bloque cruza medianoche.
create table public.worker_availability (
  id         uuid primary key default gen_random_uuid(),
  worker_id  uuid not null references public.worker_profiles(user_id) on delete cascade,
  weekday    smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time   time not null,
  check (start_time <> end_time)
);
create index worker_availability_worker_idx on public.worker_availability(worker_id);

create table public.service_areas (
  worker_id uuid references public.worker_profiles(user_id) on delete cascade,
  comuna_id int  references public.comunas(id),
  primary key (worker_id, comuna_id)
);
create index service_areas_comuna_idx on public.service_areas(comuna_id);

-- Garantiza que cada perfil corresponda al rol correcto
create or replace function public.ensure_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.user_role;
begin
  select role into r from public.profiles where id = new.user_id;
  if tg_table_name = 'business_profiles' and r is distinct from 'empresa' then
    raise exception 'Sólo una cuenta de empresa puede tener perfil de negocio' using errcode = 'P0001';
  elsif tg_table_name = 'worker_profiles' and r is distinct from 'trabajador' then
    raise exception 'Sólo una cuenta de trabajador puede tener perfil profesional' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger business_profiles_role before insert on public.business_profiles
  for each row execute function public.ensure_profile_role();
create trigger worker_profiles_role before insert on public.worker_profiles
  for each row execute function public.ensure_profile_role();

-- Alta de usuario: crea profiles desde los metadatos del registro.
-- Exige consentimiento explícito y rechaza roles no permitidos (no hay auto-alta de admin).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  r text := meta ->> 'role';
begin
  if r is null or r not in ('trabajador','empresa') then
    raise exception 'Tipo de cuenta inválido' using errcode = 'P0001';
  end if;
  if coalesce((meta ->> 'accepted_terms')::boolean, false) is not true
     or coalesce((meta ->> 'accepted_privacy')::boolean, false) is not true then
    raise exception 'Debes aceptar los términos y la política de privacidad' using errcode = 'P0001';
  end if;
  insert into public.profiles (id, role, full_name, terms_accepted_at, privacy_accepted_at)
  values (new.id, r::public.user_role, coalesce(nullif(trim(meta ->> 'full_name'), ''), 'Usuario'),
          now(), now());
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Publicaciones
-- ---------------------------------------------------------------------------
create table public.job_posts (
  id                     uuid primary key default gen_random_uuid(),
  business_id            uuid not null references public.business_profiles(user_id) on delete restrict,
  series_id              uuid,               -- agrupa turnos de varios días
  title                  text not null check (length(trim(title)) between 5 and 120),
  category_id            int  not null references public.categories(id),
  description            text not null check (length(trim(description)) between 20 and 3000),
  slots                  smallint not null default 1 check (slots between 1 and 50),
  starts_at              timestamptz not null,
  ends_at                timestamptz not null,
  duration_minutes       int generated always as ((extract(epoch from (ends_at - starts_at)) / 60)::int) stored,
  modality               public.work_modality not null default 'presencial',
  comuna_id              int references public.comunas(id),
  approx_location        text check (approx_location is null or length(approx_location) <= 160),
  pay_type               public.pay_type not null,
  pay_amount_clp         int not null check (pay_amount_clp between 1 and 10000000),
  hourly_equivalent_clp  int generated always as (
                           case when pay_type = 'por_hora' then pay_amount_clp
                                else round(pay_amount_clp * 3600.0
                                     / nullif(extract(epoch from (ends_at - starts_at)), 0))::int end) stored,
  estimated_total_clp    int generated always as (
                           case when pay_type = 'total' then pay_amount_clp
                                else round(pay_amount_clp * extract(epoch from (ends_at - starts_at)) / 3600.0)::int end) stored,
  breaks_info            text check (breaks_info is null or length(breaks_info) <= 500),
  conditions             text check (conditions is null or length(conditions) <= 1000),
  experience_required    text check (experience_required is null or length(experience_required) <= 500),
  certifications_required text check (certifications_required is null or length(certifications_required) <= 500),
  attire                 text check (attire is null or length(attire) <= 300),
  food_info              text check (food_info is null or length(food_info) <= 300),
  transport_info         text check (transport_info is null or length(transport_info) <= 300),
  additional_requirements text check (additional_requirements is null or length(additional_requirements) <= 1000),
  apply_deadline         timestamptz,
  is_urgent              boolean not null default false,
  engagement_mode        public.engagement_mode not null default 'por_definir',
  tax_doc_info           text check (tax_doc_info is null or length(tax_doc_info) <= 500),
  -- Cuestionario orientativo sobre la modalidad real de prestación
  q_autonomy                boolean,
  q_direct_supervision      boolean,
  q_imposed_schedule        boolean,
  q_continuous_instructions boolean,
  q_core_recurring          boolean,
  labor_risk             public.labor_risk generated always as (
                           public.compute_labor_risk(q_autonomy, q_direct_supervision, q_imposed_schedule,
                                                     q_continuous_instructions, q_core_recurring)) stored,
  labor_warning_ack_at   timestamptz,
  review_note            text,
  status                 public.job_status not null default 'borrador',
  published_at           timestamptz,
  cancelled_at           timestamptz,
  cancelled_by           uuid references public.profiles(id),
  cancel_reason          text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint job_times_ok       check (ends_at > starts_at),
  constraint job_max_24h        check (ends_at - starts_at <= interval '24 hours'),
  constraint job_deadline_ok    check (apply_deadline is null or apply_deadline <= starts_at),
  constraint job_location_ok    check (modality = 'remoto' or comuna_id is not null),
  constraint job_cancel_ok      check ((status = 'cancelada') = (cancelled_at is not null))
);
create index job_posts_business_idx on public.job_posts(business_id, created_at desc);
create index job_posts_search_idx   on public.job_posts(status, starts_at);
create index job_posts_cat_idx      on public.job_posts(category_id);
create index job_posts_comuna_idx   on public.job_posts(comuna_id);
create trigger job_posts_updated before update on public.job_posts
  for each row execute function public.set_updated_at();

-- Dirección exacta: sólo dueño, admin y trabajadores con contratación activa.
create table public.job_post_private (
  job_id       uuid primary key references public.job_posts(id) on delete cascade,
  address_line text not null check (length(trim(address_line)) between 5 and 200),
  access_notes text check (access_notes is null or length(access_notes) <= 500)
);

create table public.job_requirements (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.job_posts(id) on delete cascade,
  kind         text not null check (kind in ('experiencia','certificacion','documento','equipamiento','otro')),
  description  text not null check (length(trim(description)) between 2 and 300),
  is_mandatory boolean not null default true
);
create index job_requirements_job_idx on public.job_requirements(job_id);

-- ---------------------------------------------------------------------------
-- Postulaciones, ofertas y contrataciones
-- ---------------------------------------------------------------------------
create table public.applications (
  id                     uuid primary key default gen_random_uuid(),
  job_id                 uuid not null references public.job_posts(id) on delete cascade,
  worker_id              uuid not null references public.worker_profiles(user_id) on delete cascade,
  message                text check (message is null or length(message) <= 500),
  highlighted_experience text check (highlighted_experience is null or length(highlighted_experience) <= 500),
  availability_confirmed boolean not null check (availability_confirmed),
  status                 public.application_status not null default 'pendiente',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint applications_unique unique (job_id, worker_id)   -- evita postulaciones duplicadas
);
create index applications_worker_idx on public.applications(worker_id, created_at desc);
create index applications_job_idx    on public.applications(job_id, status);
create trigger applications_updated before update on public.applications
  for each row execute function public.set_updated_at();

create table public.offers (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  job_id         uuid not null references public.job_posts(id) on delete cascade,
  worker_id      uuid not null references public.worker_profiles(user_id),
  business_id    uuid not null references public.business_profiles(user_id),
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  pay_type       public.pay_type not null,
  pay_amount_clp int not null check (pay_amount_clp > 0),
  message        text check (message is null or length(message) <= 500),
  status         public.offer_status not null default 'enviada',
  expires_at     timestamptz not null,
  responded_at   timestamptz,
  created_at     timestamptz not null default now(),
  check (ends_at > starts_at)
);
create unique index offers_one_open_per_application on public.offers(application_id) where status = 'enviada';
create index offers_worker_idx on public.offers(worker_id, status);

create table public.bookings (
  id                    uuid primary key default gen_random_uuid(),
  offer_id              uuid not null unique references public.offers(id),
  job_id                uuid not null references public.job_posts(id),
  application_id        uuid not null references public.applications(id),
  worker_id             uuid not null references public.worker_profiles(user_id),
  business_id           uuid not null references public.business_profiles(user_id),
  starts_at             timestamptz not null,
  ends_at               timestamptz not null,
  pay_type              public.pay_type not null,
  pay_amount_clp        int not null check (pay_amount_clp > 0),
  terms_snapshot        jsonb not null,   -- resumen inmutable de las condiciones aceptadas
  status                public.booking_status not null default 'confirmada',
  worker_done_at        timestamptz,
  business_done_at      timestamptz,
  finished_at           timestamptz,
  cancelled_at          timestamptz,
  cancelled_by          uuid references public.profiles(id),
  cancel_reason         text,
  overlap_justification text check (overlap_justification is null or length(trim(overlap_justification)) >= 15),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (ends_at > starts_at),
  check ((status = 'cancelada') = (cancelled_at is not null)),
  check (status <> 'finalizada' or (worker_done_at is not null and business_done_at is not null)),
  -- Regla: un trabajador no puede tener dos contrataciones activas que se superpongan,
  -- salvo que haya justificado explícitamente la compatibilidad.
  constraint bookings_no_overlap exclude using gist (
    worker_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('confirmada','en_curso') and overlap_justification is null)
);
create unique index bookings_one_active_per_job_worker on public.bookings(job_id, worker_id)
  where status <> 'cancelada';
create index bookings_worker_idx   on public.bookings(worker_id, starts_at);
create index bookings_business_idx on public.bookings(business_id, starts_at);
create trigger bookings_updated before update on public.bookings
  for each row execute function public.set_updated_at();

-- Historial: una contratación nunca cambia de estado sin dejar registro.
create table public.booking_status_history (
  id          bigserial primary key,
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  from_status public.booking_status,
  to_status   public.booking_status not null,
  changed_by  uuid,
  note        text,
  created_at  timestamptz not null default now()
);
create index booking_status_history_idx on public.booking_status_history(booking_id, created_at);

create or replace function public.log_booking_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.booking_status_history (booking_id, from_status, to_status, changed_by, note)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid(),
            case when new.status = 'cancelada' then new.cancel_reason end);
  end if;
  return new;
end $$;
create trigger bookings_status_log after insert or update of status on public.bookings
  for each row execute function public.log_booking_status();

-- Cambios de horario o tarifa: deben ser aceptados por la contraparte.
create table public.booking_change_requests (
  id                 uuid primary key default gen_random_uuid(),
  booking_id         uuid not null references public.bookings(id) on delete cascade,
  proposed_by        uuid not null references public.profiles(id),
  new_starts_at      timestamptz,
  new_ends_at        timestamptz,
  new_pay_amount_clp int check (new_pay_amount_clp is null or new_pay_amount_clp > 0),
  reason             text not null check (length(trim(reason)) between 5 and 500),
  status             public.change_status not null default 'pendiente',
  responded_by       uuid references public.profiles(id),
  responded_at       timestamptz,
  created_at         timestamptz not null default now(),
  check ((new_starts_at is null) = (new_ends_at is null)),
  check (new_starts_at is null or new_ends_at > new_starts_at),
  check (new_starts_at is not null or new_pay_amount_clp is not null)
);
create unique index change_one_pending on public.booking_change_requests(booking_id) where status = 'pendiente';

-- ---------------------------------------------------------------------------
-- Mensajería (sólo tras una interacción válida)
-- ---------------------------------------------------------------------------
create table public.conversations (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications(id) on delete cascade,
  business_id    uuid not null references public.business_profiles(user_id),
  worker_id      uuid not null references public.worker_profiles(user_id),
  created_at     timestamptz not null default now()
);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null default auth.uid() references public.profiles(id),
  body            text not null check (length(trim(body)) between 1 and 2000),
  created_at      timestamptz not null default now(),
  read_at         timestamptz
);
create index messages_conv_idx on public.messages(conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Evaluaciones (sólo con contratación finalizada)
-- ---------------------------------------------------------------------------
create table public.reviews (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.bookings(id) on delete cascade,
  reviewer_id   uuid not null references public.profiles(id),
  reviewee_id   uuid not null references public.profiles(id),
  rating        smallint not null check (rating between 1 and 5),
  comment       text check (comment is null or length(comment) <= 1000),
  is_hidden     boolean not null default false,
  hidden_reason text,
  created_at    timestamptz not null default now(),
  unique (booking_id, reviewer_id),
  check (reviewer_id <> reviewee_id)
);
create index reviews_reviewee_idx on public.reviews(reviewee_id) where not is_hidden;

-- ---------------------------------------------------------------------------
-- Documentos tributarios (registro de documentos emitidos EXTERNAMENTE en el SII)
-- ---------------------------------------------------------------------------
create table public.tax_documents (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references public.bookings(id) on delete cascade,
  worker_id        uuid not null references public.worker_profiles(user_id),
  business_id      uuid not null references public.business_profiles(user_id),
  doc_type         text not null default 'boleta_honorarios_electronica'
                     check (doc_type in ('boleta_honorarios_electronica','boleta_prestacion_terceros','otro')),
  status           public.tax_doc_status not null default 'pendiente',
  folio            text check (folio is null or folio ~ '^[0-9]{1,12}$'),
  issued_on        date,
  gross_amount_clp int check (gross_amount_clp is null or gross_amount_clp > 0),
  file_path        text,          -- ruta en bucket privado, nunca URL pública
  notes            text check (notes is null or length(notes) <= 500),
  reviewed_by      uuid references public.profiles(id),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (booking_id, doc_type),
  -- No se puede marcar como emitido sin evidencia (folio y fecha informados por el usuario).
  constraint tax_doc_evidence check (status not in ('emitido','revisado') or (folio is not null and issued_on is not null)),
  constraint tax_doc_review   check (status <> 'revisado' or (reviewed_by is not null and reviewed_at is not null))
);
create trigger tax_documents_updated before update on public.tax_documents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Denuncias, notificaciones, monetización, configuración y auditoría
-- ---------------------------------------------------------------------------
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles(id),
  target_type public.report_target not null,
  target_id   uuid not null,
  reason      text not null check (reason in ('fraude','acoso','incumplimiento','no_presentacion','pago',
                                              'contenido_inapropiado','datos_personales','riesgo_laboral','otro')),
  details     text not null check (length(trim(details)) between 10 and 2000),
  status      public.report_status not null default 'abierta',
  resolution  text,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);
create index reports_status_idx on public.reports(status, created_at);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  link       text,
  channel    text not null default 'app' check (channel in ('app','email','sms','whatsapp')),
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);

create table public.plans (
  id                text primary key,
  name              text not null,
  monthly_price_clp int not null default 0 check (monthly_price_clp >= 0),
  max_active_posts  int,              -- null = sin límite
  featured_posts    int not null default 0,
  active            boolean not null default true
);
insert into public.plans (id, name, monthly_price_clp, max_active_posts, featured_posts) values
  ('gratis','Gratis',0,5,0),('mensual','Mensual',0,30,2),('premium','Premium',0,null,10);
-- Precios en 0: los cobros NO están activos hasta integrar y validar un proveedor de pagos.

create table public.subscriptions (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(user_id) on delete cascade,
  plan_id     text not null references public.plans(id),
  status      text not null default 'activa' check (status in ('activa','cancelada','vencida')),
  started_at  timestamptz not null default now(),
  ends_at     timestamptz
);
create unique index subscriptions_one_active on public.subscriptions(business_id) where status = 'activa';

-- Estructura preparada; sin integración no se registra ningún cobro real.
create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.business_profiles(user_id),
  booking_id   uuid references public.bookings(id),
  kind         text not null check (kind in ('comision','suscripcion','destacado')),
  amount_clp   int not null check (amount_clp > 0),
  status       text not null check (status in ('pendiente','pagado','fallido','reembolsado')),
  provider     text not null,
  provider_ref text not null,
  created_at   timestamptz not null default now()
);

create table public.platform_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (key, value) values
  ('monetization', '{"enabled": false, "model": "none", "commission_pct": 0, "featured_enabled": false}'),
  ('offer_expiry_hours', '12'),
  ('review_window_days', '30');

-- Registro de auditoría de sólo inserción (vía funciones SECURITY DEFINER).
create table public.audit_logs (
  id         bigserial primary key,
  actor_id   uuid,
  action     text not null,
  entity     text not null,
  entity_id  text,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs(entity, entity_id);
create index audit_logs_created_idx on public.audit_logs(created_at desc);

-- >>>>> supabase/migrations/20261004000300_security.sql
-- ============================================================================
-- Migración 3: control de acceso
-- Estrategia en tres capas:
--   1) Privilegios por columna: los usuarios NO pueden escribir columnas de estado,
--      verificación ni bloqueo. Esas columnas sólo cambian vía funciones RPC.
--   2) Row Level Security en todas las tablas.
--   3) Funciones SECURITY DEFINER que validan reglas de negocio en el servidor.
-- ============================================================================
set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Funciones auxiliares de autorización
-- ---------------------------------------------------------------------------
create or replace function public.is_admin(min_level public.admin_level default 'soporte')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_roles a
                 join public.profiles p on p.id = a.user_id
                 where a.user_id = auth.uid() and a.level >= min_level and not p.is_blocked)
$$;

create or replace function public.my_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_job_owner(p_job uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.job_posts where id = p_job and business_id = auth.uid())
$$;

create or replace function public.has_applied(p_job uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.applications where job_id = p_job and worker_id = auth.uid())
$$;

create or replace function public.has_active_booking_on_job(p_job uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bookings
                 where job_id = p_job and worker_id = auth.uid()
                   and status in ('confirmada','en_curso','finalizada','incidencia'))
$$;

-- La empresa puede ver el perfil de quien postuló a alguna de sus publicaciones.
create or replace function public.can_view_worker(p_worker uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_worker = auth.uid()
      or exists (select 1 from public.worker_profiles w where w.user_id = p_worker and w.is_public)
      or exists (select 1 from public.applications a join public.job_posts j on j.id = a.job_id
                 where a.worker_id = p_worker and j.business_id = auth.uid())
      or public.is_admin()
$$;

create or replace function public.job_is_listed(s public.job_status) returns boolean
language sql immutable as $$ select s in ('publicada','con_postulaciones') $$;

-- ---------------------------------------------------------------------------
-- Privilegios base: se parte de cero y se otorga lo mínimo.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon;

-- Catálogos de lectura pública
grant select on public.regions, public.comunas, public.categories, public.skills, public.plans to anon, authenticated;

-- Perfiles: el usuario sólo edita datos personales, nunca rol ni bloqueo.
grant select on public.profiles to authenticated;
grant update (full_name, phone, rut) on public.profiles to authenticated;

grant select on public.admin_roles to authenticated;

grant select on public.business_profiles to authenticated;
grant insert (user_id, trade_name, legal_name, rut, business_type, description, contact_email, contact_phone, comuna_id)
  on public.business_profiles to authenticated;
grant update (trade_name, legal_name, rut, business_type, description, contact_email, contact_phone, comuna_id)
  on public.business_profiles to authenticated;

grant select on public.worker_profiles to authenticated;
grant insert (user_id, display_name, bio, photo_path, experience_summary, years_experience, rate_unit,
              rate_amount_clp, can_issue_boleta, is_public) on public.worker_profiles to authenticated;
grant update (display_name, bio, photo_path, experience_summary, years_experience, rate_unit,
              rate_amount_clp, can_issue_boleta, is_public) on public.worker_profiles to authenticated;

grant select, insert, delete on public.worker_categories, public.worker_skills, public.service_areas to authenticated;
grant select, insert, update, delete on public.worker_availability to authenticated;

-- Publicaciones: contenido editable, estado sólo vía RPC.
grant select on public.job_posts to authenticated;
grant insert (business_id, series_id, title, category_id, description, slots, starts_at, ends_at, modality,
              comuna_id, approx_location, pay_type, pay_amount_clp, breaks_info, conditions, experience_required,
              certifications_required, attire, food_info, transport_info, additional_requirements, apply_deadline,
              is_urgent, engagement_mode, tax_doc_info, q_autonomy, q_direct_supervision, q_imposed_schedule,
              q_continuous_instructions, q_core_recurring, labor_warning_ack_at)
  on public.job_posts to authenticated;
grant update (title, category_id, description, slots, starts_at, ends_at, modality, comuna_id, approx_location,
              pay_type, pay_amount_clp, breaks_info, conditions, experience_required, certifications_required,
              attire, food_info, transport_info, additional_requirements, apply_deadline, is_urgent,
              engagement_mode, tax_doc_info, q_autonomy, q_direct_supervision, q_imposed_schedule,
              q_continuous_instructions, q_core_recurring, labor_warning_ack_at)
  on public.job_posts to authenticated;

grant select, insert, update, delete on public.job_post_private, public.job_requirements to authenticated;

-- Flujo de contratación: lectura directa, escritura sólo vía RPC.
grant select on public.applications, public.offers, public.bookings, public.booking_status_history,
                public.booking_change_requests, public.conversations, public.reviews, public.tax_documents
  to authenticated;

grant select on public.messages to authenticated;
grant insert (conversation_id, body) on public.messages to authenticated;

grant select on public.reports to authenticated;
grant insert (target_type, target_id, reason, details) on public.reports to authenticated;

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

grant select on public.subscriptions, public.payments, public.platform_settings to authenticated;
grant select on public.audit_logs to authenticated;   -- filtrado por RLS: sólo admin

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.regions                 enable row level security;
alter table public.comunas                 enable row level security;
alter table public.categories              enable row level security;
alter table public.skills                  enable row level security;
alter table public.plans                   enable row level security;
alter table public.profiles                enable row level security;
alter table public.admin_roles             enable row level security;
alter table public.business_profiles       enable row level security;
alter table public.worker_profiles         enable row level security;
alter table public.worker_categories       enable row level security;
alter table public.worker_skills           enable row level security;
alter table public.worker_availability     enable row level security;
alter table public.service_areas           enable row level security;
alter table public.job_posts               enable row level security;
alter table public.job_post_private        enable row level security;
alter table public.job_requirements        enable row level security;
alter table public.applications            enable row level security;
alter table public.offers                  enable row level security;
alter table public.bookings                enable row level security;
alter table public.booking_status_history  enable row level security;
alter table public.booking_change_requests enable row level security;
alter table public.conversations           enable row level security;
alter table public.messages                enable row level security;
alter table public.reviews                 enable row level security;
alter table public.tax_documents           enable row level security;
alter table public.reports                 enable row level security;
alter table public.notifications           enable row level security;
alter table public.subscriptions           enable row level security;
alter table public.payments                enable row level security;
alter table public.platform_settings       enable row level security;
alter table public.audit_logs              enable row level security;

-- Catálogos
create policy catalog_read on public.regions    for select using (true);
create policy catalog_read on public.comunas    for select using (true);
create policy catalog_read on public.categories for select using (active or public.is_admin());
create policy catalog_read on public.skills     for select using (active or public.is_admin());
create policy catalog_read on public.plans      for select using (true);

-- Perfiles personales
create policy own_or_admin_read on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy own_update        on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy admin_roles_read on public.admin_roles for select using (user_id = auth.uid() or public.is_admin());

-- Negocios: tabla con RUT y contacto -> sólo dueño y admin. La vista pública expone lo demás.
create policy own_or_admin_read on public.business_profiles for select
  using (user_id = auth.uid() or public.is_admin());
create policy own_insert on public.business_profiles for insert
  with check (user_id = auth.uid() and public.my_role() = 'empresa');
create policy own_update on public.business_profiles for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Trabajadores
create policy visible_read on public.worker_profiles for select using (public.can_view_worker(user_id));
create policy own_insert   on public.worker_profiles for insert
  with check (user_id = auth.uid() and public.my_role() = 'trabajador');
create policy own_update   on public.worker_profiles for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy visible_read on public.worker_categories   for select using (public.can_view_worker(worker_id));
create policy own_write    on public.worker_categories   for insert with check (worker_id = auth.uid());
create policy own_delete   on public.worker_categories   for delete using (worker_id = auth.uid());
create policy visible_read on public.worker_skills       for select using (public.can_view_worker(worker_id));
create policy own_write    on public.worker_skills       for insert with check (worker_id = auth.uid());
create policy own_delete   on public.worker_skills       for delete using (worker_id = auth.uid());
create policy visible_read on public.service_areas       for select using (public.can_view_worker(worker_id));
create policy own_write    on public.service_areas       for insert with check (worker_id = auth.uid());
create policy own_delete   on public.service_areas       for delete using (worker_id = auth.uid());
create policy visible_read on public.worker_availability for select using (public.can_view_worker(worker_id));
create policy own_all      on public.worker_availability for all
  using (worker_id = auth.uid()) with check (worker_id = auth.uid());

-- Publicaciones
create policy job_read on public.job_posts for select using (
  public.job_is_listed(status) or business_id = auth.uid() or public.has_applied(id) or public.is_admin()
);
create policy job_insert on public.job_posts for insert with check (
  business_id = auth.uid() and public.my_role() = 'empresa'
);
-- Edición de contenido sólo en borrador o mientras no existan contrataciones.
create policy job_update on public.job_posts for update using (
  business_id = auth.uid() and status in ('borrador','publicada','con_postulaciones','en_revision')
) with check (business_id = auth.uid());

create policy job_private_read on public.job_post_private for select using (
  public.is_job_owner(job_id) or public.has_active_booking_on_job(job_id) or public.is_admin()
);
create policy job_private_write on public.job_post_private for all
  using (public.is_job_owner(job_id)) with check (public.is_job_owner(job_id));

create policy req_read on public.job_requirements for select using (
  exists (select 1 from public.job_posts j where j.id = job_id)   -- hereda RLS de job_posts
);
create policy req_write on public.job_requirements for all
  using (public.is_job_owner(job_id)) with check (public.is_job_owner(job_id));

-- Flujo de contratación (lectura para las partes)
create policy party_read on public.applications for select using (
  worker_id = auth.uid() or public.is_job_owner(job_id) or public.is_admin()
);
create policy party_read on public.offers for select using (
  worker_id = auth.uid() or business_id = auth.uid() or public.is_admin()
);
create policy party_read on public.bookings for select using (
  worker_id = auth.uid() or business_id = auth.uid() or public.is_admin()
);
create policy party_read on public.booking_status_history for select using (
  exists (select 1 from public.bookings b where b.id = booking_id)
);
create policy party_read on public.booking_change_requests for select using (
  exists (select 1 from public.bookings b where b.id = booking_id)
);
create policy party_read on public.conversations for select using (
  worker_id = auth.uid() or business_id = auth.uid() or public.is_admin()
);
create policy party_read on public.messages for select using (
  exists (select 1 from public.conversations c where c.id = conversation_id)
);
create policy party_insert on public.messages for insert with check (
  sender_id = auth.uid()
  and exists (select 1 from public.conversations c
              where c.id = conversation_id and (c.worker_id = auth.uid() or c.business_id = auth.uid()))
  and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_blocked)
);

create policy review_read on public.reviews for select using (
  not is_hidden or reviewer_id = auth.uid() or reviewee_id = auth.uid() or public.is_admin()
);

create policy party_read on public.tax_documents for select using (
  worker_id = auth.uid() or business_id = auth.uid() or public.is_admin()
);

create policy report_read   on public.reports for select using (reporter_id = auth.uid() or public.is_admin());
create policy report_insert on public.reports for insert with check (reporter_id = auth.uid());

create policy own_read   on public.notifications for select using (user_id = auth.uid());
create policy own_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy own_read on public.subscriptions for select using (business_id = auth.uid() or public.is_admin());
create policy own_read on public.payments      for select using (business_id = auth.uid() or public.is_admin());
create policy settings_read on public.platform_settings for select using (auth.uid() is not null);
create policy admin_read on public.audit_logs  for select using (public.is_admin('moderador'));

-- ---------------------------------------------------------------------------
-- Vistas públicas (exponen sólo columnas no sensibles)
-- ---------------------------------------------------------------------------
create view public.v_public_businesses with (security_barrier = true) as
select b.user_id, b.trade_name, b.business_type, b.description, b.comuna_id, c.name as comuna,
       b.verification_status,
       (select round(avg(r.rating)::numeric, 1) from public.reviews r
         where r.reviewee_id = b.user_id and not r.is_hidden) as rating_avg,
       (select count(*) from public.reviews r
         where r.reviewee_id = b.user_id and not r.is_hidden) as rating_count
from public.business_profiles b
join public.profiles p on p.id = b.user_id and not p.is_blocked
left join public.comunas c on c.id = b.comuna_id;

create view public.v_worker_ratings with (security_barrier = true) as
select r.reviewee_id as worker_id, round(avg(r.rating)::numeric, 1) as rating_avg, count(*) as rating_count,
       (select count(*) from public.bookings b where b.worker_id = r.reviewee_id and b.status = 'finalizada') as services_done
from public.reviews r
join public.worker_profiles w on w.user_id = r.reviewee_id
where not r.is_hidden
group by r.reviewee_id;

grant select on public.v_public_businesses, public.v_worker_ratings to anon, authenticated;

-- >>>>> supabase/migrations/20261004000400_business_logic.sql
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

-- >>>>> supabase/migrations/20261004000500_storage_cron.sql
-- ============================================================================
-- Migración 5: almacenamiento privado y tareas programadas.
-- Sólo se aplica si existen los esquemas de Supabase (storage / pg_cron).
-- ADVERTENCIA: no verificada en el entorno local de pruebas (no existe storage allí).
-- Validar en el primer `supabase db push`.
-- ============================================================================
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
      ('documentos-tributarios', 'documentos-tributarios', false, 5242880, array['application/pdf','image/jpeg','image/png']),
      ('fotos-perfil',           'fotos-perfil',           false, 2097152, array['image/jpeg','image/png','image/webp'])
    on conflict (id) do nothing;

    -- Cada usuario sólo sube dentro de su carpeta: <uid>/archivo
    execute $p$ create policy "docs: subir en carpeta propia" on storage.objects for insert to authenticated
      with check (bucket_id = 'documentos-tributarios' and (storage.foldername(name))[1] = auth.uid()::text) $p$;
    -- Lectura: dueño de la carpeta, contraparte del servicio asociado o administración
    execute $p$ create policy "docs: lectura partes" on storage.objects for select to authenticated
      using (bucket_id = 'documentos-tributarios' and (
        (storage.foldername(name))[1] = auth.uid()::text
        or exists (select 1 from public.tax_documents d where d.file_path = name
                   and (d.business_id = auth.uid() or public.is_admin())))) $p$;

    execute $p$ create policy "fotos: gestionar propia" on storage.objects for all to authenticated
      using (bucket_id = 'fotos-perfil' and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = 'fotos-perfil' and (storage.foldername(name))[1] = auth.uid()::text) $p$;
    execute $p$ create policy "fotos: lectura si el perfil es visible" on storage.objects for select to authenticated
      using (bucket_id = 'fotos-perfil' and public.can_view_worker(((storage.foldername(name))[1])::uuid)) $p$;
  end if;

  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('turnoexpress-refresh-estados', '*/5 * * * *', 'select public.refresh_time_states()');
  end if;
end $$;

-- >>>>> supabase/migrations/20261009000600_regiones_chile.sql
-- ============================================================================
-- Migración 6: cobertura nacional. Las 16 regiones y sus 346 comunas.
-- Orden norte → sur en regions.sort_order. La RM y sus 52 comunas ya existían.
-- ============================================================================
alter table public.regions add column if not exists sort_order smallint not null default 0;

insert into public.regions (id, name, active) values
  (15, 'Región de Arica y Parinacota', true),
  (1, 'Región de Tarapacá', true),
  (2, 'Región de Antofagasta', true),
  (3, 'Región de Atacama', true),
  (4, 'Región de Coquimbo', true),
  (5, 'Región de Valparaíso', true),
  (6, 'Región del Libertador General Bernardo O''Higgins', true),
  (7, 'Región del Maule', true),
  (16, 'Región de Ñuble', true),
  (8, 'Región del Biobío', true),
  (9, 'Región de La Araucanía', true),
  (14, 'Región de Los Ríos', true),
  (10, 'Región de Los Lagos', true),
  (11, 'Región de Aysén del General Carlos Ibáñez del Campo', true),
  (12, 'Región de Magallanes y de la Antártica Chilena', true)
on conflict (id) do nothing;

update public.regions set active = true;
update public.regions set sort_order = v.ord from (values (15,1), (1,2), (2,3), (3,4), (4,5), (5,6), (13,7), (6,8), (7,9), (16,10), (8,11), (9,12), (14,13), (10,14), (11,15), (12,16)) as v(id, ord) where regions.id = v.id;

insert into public.comunas (region_id, name) values
  (15, 'Arica'),
  (15, 'Camarones'),
  (15, 'Putre'),
  (15, 'General Lagos'),
  (1, 'Iquique'),
  (1, 'Alto Hospicio'),
  (1, 'Pozo Almonte'),
  (1, 'Camiña'),
  (1, 'Colchane'),
  (1, 'Huara'),
  (1, 'Pica'),
  (2, 'Antofagasta'),
  (2, 'Mejillones'),
  (2, 'Sierra Gorda'),
  (2, 'Taltal'),
  (2, 'Calama'),
  (2, 'Ollagüe'),
  (2, 'San Pedro de Atacama'),
  (2, 'Tocopilla'),
  (2, 'María Elena'),
  (3, 'Copiapó'),
  (3, 'Caldera'),
  (3, 'Tierra Amarilla'),
  (3, 'Chañaral'),
  (3, 'Diego de Almagro'),
  (3, 'Vallenar'),
  (3, 'Alto del Carmen'),
  (3, 'Freirina'),
  (3, 'Huasco'),
  (4, 'La Serena'),
  (4, 'Coquimbo'),
  (4, 'Andacollo'),
  (4, 'La Higuera'),
  (4, 'Paiguano'),
  (4, 'Vicuña'),
  (4, 'Illapel'),
  (4, 'Canela'),
  (4, 'Los Vilos'),
  (4, 'Salamanca'),
  (4, 'Ovalle'),
  (4, 'Combarbalá'),
  (4, 'Monte Patria'),
  (4, 'Punitaqui'),
  (4, 'Río Hurtado'),
  (5, 'Valparaíso'),
  (5, 'Casablanca'),
  (5, 'Concón'),
  (5, 'Juan Fernández'),
  (5, 'Puchuncaví'),
  (5, 'Quintero'),
  (5, 'Viña del Mar'),
  (5, 'Isla de Pascua'),
  (5, 'Los Andes'),
  (5, 'Calle Larga'),
  (5, 'Rinconada'),
  (5, 'San Esteban'),
  (5, 'La Ligua'),
  (5, 'Cabildo'),
  (5, 'Papudo'),
  (5, 'Petorca'),
  (5, 'Zapallar'),
  (5, 'Quillota'),
  (5, 'La Calera'),
  (5, 'Hijuelas'),
  (5, 'La Cruz'),
  (5, 'Nogales'),
  (5, 'San Antonio'),
  (5, 'Algarrobo'),
  (5, 'Cartagena'),
  (5, 'El Quisco'),
  (5, 'El Tabo'),
  (5, 'Santo Domingo'),
  (5, 'San Felipe'),
  (5, 'Catemu'),
  (5, 'Llaillay'),
  (5, 'Panquehue'),
  (5, 'Putaendo'),
  (5, 'Santa María'),
  (5, 'Quilpué'),
  (5, 'Limache'),
  (5, 'Olmué'),
  (5, 'Villa Alemana'),
  (6, 'Rancagua'),
  (6, 'Codegua'),
  (6, 'Coinco'),
  (6, 'Coltauco'),
  (6, 'Doñihue'),
  (6, 'Graneros'),
  (6, 'Las Cabras'),
  (6, 'Machalí'),
  (6, 'Malloa'),
  (6, 'Mostazal'),
  (6, 'Olivar'),
  (6, 'Peumo'),
  (6, 'Pichidegua'),
  (6, 'Quinta de Tilcoco'),
  (6, 'Rengo'),
  (6, 'Requínoa'),
  (6, 'San Vicente'),
  (6, 'Pichilemu'),
  (6, 'La Estrella'),
  (6, 'Litueche'),
  (6, 'Marchigüe'),
  (6, 'Navidad'),
  (6, 'Paredones'),
  (6, 'San Fernando'),
  (6, 'Chépica'),
  (6, 'Chimbarongo'),
  (6, 'Lolol'),
  (6, 'Nancagua'),
  (6, 'Palmilla'),
  (6, 'Peralillo'),
  (6, 'Placilla'),
  (6, 'Pumanque'),
  (6, 'Santa Cruz'),
  (7, 'Talca'),
  (7, 'Constitución'),
  (7, 'Curepto'),
  (7, 'Empedrado'),
  (7, 'Maule'),
  (7, 'Pelarco'),
  (7, 'Pencahue'),
  (7, 'Río Claro'),
  (7, 'San Clemente'),
  (7, 'San Rafael'),
  (7, 'Cauquenes'),
  (7, 'Chanco'),
  (7, 'Pelluhue'),
  (7, 'Curicó'),
  (7, 'Hualañé'),
  (7, 'Licantén'),
  (7, 'Molina'),
  (7, 'Rauco'),
  (7, 'Romeral'),
  (7, 'Sagrada Familia'),
  (7, 'Teno'),
  (7, 'Vichuquén'),
  (7, 'Linares'),
  (7, 'Colbún'),
  (7, 'Longaví'),
  (7, 'Parral'),
  (7, 'Retiro'),
  (7, 'San Javier'),
  (7, 'Villa Alegre'),
  (7, 'Yerbas Buenas'),
  (16, 'Chillán'),
  (16, 'Bulnes'),
  (16, 'Chillán Viejo'),
  (16, 'El Carmen'),
  (16, 'Pemuco'),
  (16, 'Pinto'),
  (16, 'Quillón'),
  (16, 'San Ignacio'),
  (16, 'Yungay'),
  (16, 'Quirihue'),
  (16, 'Cobquecura'),
  (16, 'Coelemu'),
  (16, 'Ninhue'),
  (16, 'Portezuelo'),
  (16, 'Ránquil'),
  (16, 'Treguaco'),
  (16, 'San Carlos'),
  (16, 'Coihueco'),
  (16, 'Ñiquén'),
  (16, 'San Fabián'),
  (16, 'San Nicolás'),
  (8, 'Concepción'),
  (8, 'Coronel'),
  (8, 'Chiguayante'),
  (8, 'Florida'),
  (8, 'Hualqui'),
  (8, 'Lota'),
  (8, 'Penco'),
  (8, 'San Pedro de la Paz'),
  (8, 'Santa Juana'),
  (8, 'Talcahuano'),
  (8, 'Tomé'),
  (8, 'Hualpén'),
  (8, 'Lebu'),
  (8, 'Arauco'),
  (8, 'Cañete'),
  (8, 'Contulmo'),
  (8, 'Curanilahue'),
  (8, 'Los Álamos'),
  (8, 'Tirúa'),
  (8, 'Los Ángeles'),
  (8, 'Antuco'),
  (8, 'Cabrero'),
  (8, 'Laja'),
  (8, 'Mulchén'),
  (8, 'Nacimiento'),
  (8, 'Negrete'),
  (8, 'Quilaco'),
  (8, 'Quilleco'),
  (8, 'San Rosendo'),
  (8, 'Santa Bárbara'),
  (8, 'Tucapel'),
  (8, 'Yumbel'),
  (8, 'Alto Biobío'),
  (9, 'Temuco'),
  (9, 'Carahue'),
  (9, 'Cunco'),
  (9, 'Curarrehue'),
  (9, 'Freire'),
  (9, 'Galvarino'),
  (9, 'Gorbea'),
  (9, 'Lautaro'),
  (9, 'Loncoche'),
  (9, 'Melipeuco'),
  (9, 'Nueva Imperial'),
  (9, 'Padre Las Casas'),
  (9, 'Perquenco'),
  (9, 'Pitrufquén'),
  (9, 'Pucón'),
  (9, 'Saavedra'),
  (9, 'Teodoro Schmidt'),
  (9, 'Toltén'),
  (9, 'Vilcún'),
  (9, 'Villarrica'),
  (9, 'Cholchol'),
  (9, 'Angol'),
  (9, 'Collipulli'),
  (9, 'Curacautín'),
  (9, 'Ercilla'),
  (9, 'Lonquimay'),
  (9, 'Los Sauces'),
  (9, 'Lumaco'),
  (9, 'Purén'),
  (9, 'Renaico'),
  (9, 'Traiguén'),
  (9, 'Victoria'),
  (14, 'Valdivia'),
  (14, 'Corral'),
  (14, 'Lanco'),
  (14, 'Los Lagos'),
  (14, 'Máfil'),
  (14, 'Mariquina'),
  (14, 'Paillaco'),
  (14, 'Panguipulli'),
  (14, 'La Unión'),
  (14, 'Futrono'),
  (14, 'Lago Ranco'),
  (14, 'Río Bueno'),
  (10, 'Puerto Montt'),
  (10, 'Calbuco'),
  (10, 'Cochamó'),
  (10, 'Fresia'),
  (10, 'Frutillar'),
  (10, 'Los Muermos'),
  (10, 'Llanquihue'),
  (10, 'Maullín'),
  (10, 'Puerto Varas'),
  (10, 'Castro'),
  (10, 'Ancud'),
  (10, 'Chonchi'),
  (10, 'Curaco de Vélez'),
  (10, 'Dalcahue'),
  (10, 'Puqueldón'),
  (10, 'Queilén'),
  (10, 'Quellón'),
  (10, 'Quemchi'),
  (10, 'Quinchao'),
  (10, 'Osorno'),
  (10, 'Puerto Octay'),
  (10, 'Purranque'),
  (10, 'Puyehue'),
  (10, 'Río Negro'),
  (10, 'San Juan de la Costa'),
  (10, 'San Pablo'),
  (10, 'Chaitén'),
  (10, 'Futaleufú'),
  (10, 'Hualaihué'),
  (10, 'Palena'),
  (11, 'Coyhaique'),
  (11, 'Lago Verde'),
  (11, 'Aysén'),
  (11, 'Cisnes'),
  (11, 'Guaitecas'),
  (11, 'Cochrane'),
  (11, 'O''Higgins'),
  (11, 'Tortel'),
  (11, 'Chile Chico'),
  (11, 'Río Ibáñez'),
  (12, 'Punta Arenas'),
  (12, 'Laguna Blanca'),
  (12, 'Río Verde'),
  (12, 'San Gregorio'),
  (12, 'Cabo de Hornos'),
  (12, 'Antártica'),
  (12, 'Porvenir'),
  (12, 'Primavera'),
  (12, 'Timaukel'),
  (12, 'Natales'),
  (12, 'Torres del Paine')
on conflict (region_id, name) do nothing;

create index if not exists comunas_name_idx on public.comunas(name);

-- >>>>> supabase/migrations/20261009000700_empresa_y_preguntas.sql
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

-- >>>>> supabase/migrations/20261009000800_registro_empresa.sql
-- ============================================================================
-- Migración 8: registro de empresa en un solo paso.
--  · Sector, tamaño (tramos de la Ley 20.416) y turnos estimados al mes.
--  · RUT de empresa único sin importar el formato (76.086.428-5 = 76086428-5).
--  · rut_empresa_disponible(): permite avisar antes de crear la cuenta.
-- ============================================================================
set search_path = public, extensions;

alter table public.business_profiles
  add column sector text check (sector is null or sector in (
    'Gastronomía y restaurantes', 'Hotelería y turismo', 'Eventos y producción', 'Comercio y retail',
    'Supermercados', 'Logística y bodegaje', 'Transporte', 'Aseo y servicios generales', 'Construcción',
    'Oficinas y servicios profesionales', 'Salud', 'Educación', 'Agroindustria', 'Manufactura', 'Otro')),
  add column employees_range text check (employees_range is null or employees_range in ('1 a 9', '10 a 49', '50 a 199', '200 o más')),
  add column shifts_per_month text check (shifts_per_month is null or shifts_per_month in ('1 a 5', '6 a 20', '21 a 50', 'Más de 50'));

grant insert (sector, employees_range, shifts_per_month) on public.business_profiles to authenticated;
grant update (sector, employees_range, shifts_per_month) on public.business_profiles to authenticated;

-- Unicidad del RUT comparando solo dígitos y K.
create or replace function public.rut_clave(p text) returns text
language sql immutable as $$ select nullif(upper(regexp_replace(coalesce(p, ''), '[^0-9kK]', '', 'g')), '') $$;

drop index if exists public.business_rut_uq;
create unique index business_rut_uq on public.business_profiles (public.rut_clave(rut)) where rut is not null;

-- ¿Se puede registrar este RUT de empresa? (false si es inválido o ya existe).
-- Los RUT de empresa son datos públicos del SII; la función solo responde sí/no.
create or replace function public.rut_empresa_disponible(p_rut text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.rut_is_valid(p_rut)
     and not exists (select 1 from public.business_profiles where public.rut_clave(rut) = public.rut_clave(p_rut))
$$;

revoke execute on function public.rut_empresa_disponible(text) from public;
grant execute on function public.rut_clave(text) to anon, authenticated;
grant execute on function public.rut_empresa_disponible(text) to anon, authenticated;

-- >>>>> supabase/migrations/20261009000900_preguntas_500.sql
-- ============================================================================
-- Migración 9: las preguntas del empleador pueden tener hasta 500 caracteres (antes 200).
-- ============================================================================
alter table public.job_questions drop constraint if exists job_questions_prompt_check;
alter table public.job_questions
  add constraint job_questions_prompt_check check (length(trim(prompt)) between 5 and 500);

-- >>>>> supabase/migrations/20261009001000_contrato_y_normas.sql
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

-- >>>>> supabase/migrations/20261009001100_condiciones_empleador.sql
-- ============================================================================
-- Migración 11: aceptación obligatoria de las condiciones del empleador.
-- Cada turno guarda la versión del texto aceptado y la fecha. No se publica sin aceptación.
-- El texto vigente está en lib/condiciones.ts (CONDICIONES_VERSION).
-- ============================================================================
set search_path = public, extensions;

alter table public.job_posts
  add column employer_terms_version     text check (employer_terms_version is null or length(employer_terms_version) <= 20),
  add column employer_terms_accepted_at timestamptz,
  add constraint job_posts_terms_ok check ((employer_terms_version is null) = (employer_terms_accepted_at is null));

grant insert (employer_terms_version, employer_terms_accepted_at) on public.job_posts to authenticated;
grant update (employer_terms_version, employer_terms_accepted_at) on public.job_posts to authenticated;

create or replace function public.enforce_employer_terms() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'borrador' and new.status in ('publicada', 'en_revision') and new.employer_terms_accepted_at is null then
    raise exception 'Debes aceptar las condiciones del empleador antes de publicar' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger job_posts_employer_terms before update of status on public.job_posts
  for each row execute function public.enforce_employer_terms();

revoke execute on function public.enforce_employer_terms() from public, anon, authenticated;
