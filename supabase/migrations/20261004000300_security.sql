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
