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
