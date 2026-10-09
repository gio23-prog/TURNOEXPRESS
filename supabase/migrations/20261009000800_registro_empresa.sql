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
