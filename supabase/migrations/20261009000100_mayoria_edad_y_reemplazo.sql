-- ============================================================================
-- Migración 6: mayoría de edad en el registro y pregunta de reemplazo
-- ============================================================================
set search_path = public, extensions;

-- Mayoría de edad declarada al registrarse (CUMPLIMIENTO_LEGAL.md, punto 14).
-- Nullable para no invalidar cuentas creadas antes de esta migración.
alter table public.profiles add column adult_confirmed_at timestamptz;

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
  if coalesce((meta ->> 'is_adult')::boolean, false) is not true then
    raise exception 'Debes ser mayor de 18 años para registrarte' using errcode = 'P0001';
  end if;
  insert into public.profiles (id, role, full_name, terms_accepted_at, privacy_accepted_at, adult_confirmed_at)
  values (new.id, r::public.user_role, coalesce(nullif(trim(meta ->> 'full_name'), ''), 'Usuario'),
          now(), now(), now());
  return new;
end $$;

-- ¿El turno reemplaza a personal propio ausente? Es el supuesto típico de suministro
-- de trabajadores (EST, CUMPLIMIENTO_LEGAL.md punto 2). Sólo informativo: no altera
-- compute_labor_risk ni el estado de publicación hasta que lo defina la revisión legal.
alter table public.job_posts add column q_replaces_staff boolean;
grant insert (q_replaces_staff), update (q_replaces_staff) on public.job_posts to authenticated;
