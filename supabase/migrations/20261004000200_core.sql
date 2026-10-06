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
