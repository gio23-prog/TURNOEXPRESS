-- ============================================================================
-- Migración 14: número de postulantes por turno, para "Mis postulaciones".
-- El trabajador solo puede leer su propia postulación (RLS), así que el conteo se entrega
-- con una función que devuelve únicamente cifras, de turnos que el usuario puede ver.
-- ============================================================================
set search_path = public, extensions;

create or replace function public.job_applicant_counts(p_jobs uuid[])
returns table (job_id uuid, applicants bigint)
language sql stable security definer set search_path = public as $$
  select j.id, (select count(*) from public.applications a where a.job_id = j.id and a.status not in ('retirada'))
  from public.job_posts j
  where j.id = any(p_jobs)
    and (j.business_id = auth.uid()
         or exists (select 1 from public.applications a where a.job_id = j.id and a.worker_id = auth.uid())
         or public.job_is_listed(j.status))
$$;

revoke execute on function public.job_applicant_counts(uuid[]) from public, anon;
grant execute on function public.job_applicant_counts(uuid[]) to authenticated;
