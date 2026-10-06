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
