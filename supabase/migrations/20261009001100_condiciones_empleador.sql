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
