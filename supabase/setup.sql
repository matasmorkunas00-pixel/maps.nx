create extension if not exists pgcrypto;

create table if not exists public.gpx_routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  folder text not null default 'Imported',
  file_name text not null,
  storage_path text not null unique,
  color text not null default '#2563eb',
  imported_at timestamptz not null default timezone('utc', now())
);

alter table public.gpx_routes enable row level security;

create policy "Users can view their own GPX routes"
on public.gpx_routes
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own GPX routes"
on public.gpx_routes
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own GPX routes"
on public.gpx_routes
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own GPX routes"
on public.gpx_routes
for delete
to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public)
values ('gpx-files', 'gpx-files', false)
on conflict (id) do nothing;

create policy "Users can read their own GPX files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'gpx-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users can upload their own GPX files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'gpx-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users can update their own GPX files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'gpx-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'gpx-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users can delete their own GPX files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'gpx-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
