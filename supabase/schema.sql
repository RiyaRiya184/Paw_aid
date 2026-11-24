-- ==========================================================================
-- Paw Aid — Supabase database schema
--
-- How to use: open your Supabase project → SQL Editor → New query,
-- paste this whole file, and click Run. It is safe to run more than once.
--
-- Roles
--   citizen : signs up freely; reports dogs; sees only their own reports
--   ngo     : signs up, then must be APPROVED by an admin; accepts open
--             cases and updates the status of cases assigned to it
--   admin   : can never be chosen at sign-up; promote the first admin by
--             hand (see the bottom of this file)
--
-- Security model
--   Every table has Row Level Security on. Anything that changes a report's
--   status or assignment goes through a function below that checks the
--   caller's role, so editing the page in a browser cannot get around it.
-- ==========================================================================

create extension if not exists pgcrypto;

-- -------------------------------------------------------------------------
-- Tables
-- -------------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  email       text not null default '',
  phone       text not null default '',
  role        text not null default 'citizen' check (role in ('citizen','ngo','admin')),
  created_at  timestamptz not null default now()
);

create table if not exists public.ngos (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null unique references public.profiles(id) on delete cascade,
  name        text not null,
  city        text not null default '',
  phone       text not null default '',
  email       text not null default '',
  status      text not null default 'pending' check (status in ('pending','approved','suspended')),
  created_at  timestamptz not null default now()
);

create sequence if not exists public.report_code_seq start 1001;

create table if not exists public.reports (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique default ('PA-' || nextval('public.report_code_seq')),
  dog_description text not null check (length(dog_description) between 3 and 200),
  severity        text not null default 'Other'
                  check (severity in ('Injured','Sick','Malnourished','Aggressive','Other')),
  location        text not null check (length(location) between 3 and 300),
  latitude        double precision,
  longitude       double precision,
  description     text not null default '' check (length(description) <= 2000),
  photo_path      text,
  reporter_id     uuid references public.profiles(id) on delete set null,
  reporter_name   text not null check (length(reporter_name) between 1 and 120),
  reporter_phone  text not null check (length(reporter_phone) between 6 and 20),
  status          text not null default 'Pending'
                  check (status in ('Pending','In Progress','Resolved','Rejected')),
  ngo_id          uuid references public.ngos(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists reports_reporter_idx on public.reports(reporter_id);
create index if not exists reports_ngo_idx on public.reports(ngo_id);
create index if not exists reports_status_idx on public.reports(status);

create table if not exists public.report_updates (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.reports(id) on delete cascade,
  status      text not null,
  note        text not null default '',
  actor_id    uuid references public.profiles(id) on delete set null,
  actor_label text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists report_updates_report_idx on public.report_updates(report_id);

create table if not exists public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 1 and 120),
  email       text not null check (length(email) between 3 and 200),
  message     text not null check (length(message) between 1 and 4000),
  handled     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- -------------------------------------------------------------------------
-- Helper functions (used by the security rules)
-- -------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- The caller's NGO id, only if that NGO is approved.
create or replace function public.my_ngo_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from ngos where owner_id = auth.uid() and status = 'approved';
$$;

create or replace function public.can_see_report(r public.reports)
returns boolean language sql stable security definer set search_path = public as $$
  select
    (auth.uid() is not null and r.reporter_id = auth.uid())
    or is_admin()
    or (my_ngo_id() is not null
        and (r.ngo_id = my_ngo_id() or (r.ngo_id is null and r.status = 'Pending')));
$$;

-- -------------------------------------------------------------------------
-- New sign-ups: create the profile (and NGO record) automatically.
-- The requested role comes from sign-up metadata; 'admin' is never accepted.
-- -------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wanted text := coalesce(meta->>'role', 'citizen');
begin
  if wanted not in ('citizen','ngo') then
    wanted := 'citizen';
  end if;

  insert into profiles (id, full_name, email, phone, role)
  values (new.id,
          left(coalesce(meta->>'full_name', ''), 120),
          coalesce(new.email, ''),
          left(coalesce(meta->>'phone', ''), 20),
          wanted)
  on conflict (id) do nothing;

  if wanted = 'ngo' then
    insert into ngos (owner_id, name, city, phone, email)
    values (new.id,
            left(coalesce(nullif(meta->>'org_name', ''), meta->>'full_name', 'Unnamed NGO'), 120),
            left(coalesce(meta->>'city', ''), 80),
            left(coalesce(meta->>'phone', ''), 20),
            coalesce(new.email, ''))
    on conflict (owner_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -------------------------------------------------------------------------
-- Row Level Security
-- -------------------------------------------------------------------------

alter table public.profiles          enable row level security;
alter table public.ngos              enable row level security;
alter table public.reports           enable row level security;
alter table public.report_updates    enable row level security;
alter table public.contact_messages  enable row level security;

-- profiles: you see yourself; admins see everyone. You may edit only your
-- own name and phone. Roles change only via SQL (see bottom of file).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- ngos: approved NGOs are public (names show on tracking pages); owners and
-- admins see their own / all. Owners may edit their details, never their status.
drop policy if exists ngos_select on public.ngos;
create policy ngos_select on public.ngos for select
  using (status = 'approved' or owner_id = auth.uid() or public.is_admin());

drop policy if exists ngos_update_owner on public.ngos;
create policy ngos_update_owner on public.ngos for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

revoke insert, update, delete on public.ngos from anon, authenticated;
grant select on public.ngos to anon, authenticated;
grant update (name, city, phone) on public.ngos to authenticated;

-- reports: read according to can_see_report(); only admins delete.
-- Creating and changing reports happens through the functions below.
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports for select
  using (public.can_see_report(reports));

drop policy if exists reports_delete_admin on public.reports;
create policy reports_delete_admin on public.reports for delete
  using (public.is_admin());

revoke insert, update, delete on public.reports from anon, authenticated;
revoke select on public.reports from anon;
grant select, delete on public.reports to authenticated;

-- report_updates: visible to whoever can see the report.
drop policy if exists updates_select on public.report_updates;
create policy updates_select on public.report_updates for select
  using (exists (select 1 from public.reports r where r.id = report_id and public.can_see_report(r)));

revoke insert, update, delete on public.report_updates from anon, authenticated;
revoke select on public.report_updates from anon;
grant select on public.report_updates to authenticated;

-- contact_messages: anyone can send; only admins read or mark handled.
drop policy if exists contact_insert on public.contact_messages;
create policy contact_insert on public.contact_messages for insert
  with check (handled = false);

drop policy if exists contact_admin_select on public.contact_messages;
create policy contact_admin_select on public.contact_messages for select
  using (public.is_admin());

drop policy if exists contact_admin_update on public.contact_messages;
create policy contact_admin_update on public.contact_messages for update
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists contact_admin_delete on public.contact_messages;
create policy contact_admin_delete on public.contact_messages for delete
  using (public.is_admin());

revoke all on public.contact_messages from anon, authenticated;
grant insert (name, email, message) on public.contact_messages to anon, authenticated;
grant select, update, delete on public.contact_messages to authenticated;

-- -------------------------------------------------------------------------
-- Actions (called from the website with supabase.rpc(...))
-- -------------------------------------------------------------------------

-- Anyone (logged in or not) can file a report. Returns the tracking code.
create or replace function public.submit_report(
  p_dog_description text,
  p_severity text,
  p_location text,
  p_description text,
  p_reporter_name text,
  p_reporter_phone text,
  p_photo_path text default null,
  p_latitude double precision default null,
  p_longitude double precision default null
) returns text language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  new_code text;
begin
  if p_photo_path is not null and p_photo_path !~ '^reports/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp|gif)$' then
    raise exception 'Invalid photo path';
  end if;

  insert into reports (dog_description, severity, location, description,
                       reporter_id, reporter_name, reporter_phone,
                       photo_path, latitude, longitude)
  values (trim(p_dog_description),
          coalesce(nullif(p_severity, ''), 'Other'),
          trim(p_location),
          coalesce(trim(p_description), ''),
          auth.uid(),
          trim(p_reporter_name),
          trim(p_reporter_phone),
          p_photo_path,
          p_latitude, p_longitude)
  returning id, code into new_id, new_code;

  insert into report_updates (report_id, status, note, actor_id, actor_label)
  values (new_id, 'Pending', 'Report submitted', auth.uid(), 'Reporter');

  return new_code;
end;
$$;

-- Public tracking by code: no login needed, no phone numbers returned.
create or replace function public.track_report(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', r.code,
    'dog_description', r.dog_description,
    'severity', r.severity,
    'location', r.location,
    'status', r.status,
    'created_at', r.created_at,
    'ngo_name', n.name,
    'photo_path', r.photo_path,
    'updates', coalesce((
      select jsonb_agg(jsonb_build_object(
               'status', u.status, 'note', u.note,
               'actor', u.actor_label, 'at', u.created_at)
             order by u.created_at)
      from report_updates u where u.report_id = r.id), '[]'::jsonb)
  )
  from reports r
  left join ngos n on n.id = r.ngo_id
  where upper(r.code) = upper(trim(p_code));
$$;

-- NGO takes an open case.
create or replace function public.ngo_accept_report(p_report uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  my_ngo uuid := my_ngo_id();
  ngo_name text;
begin
  if my_ngo is null then raise exception 'Only approved NGOs can accept cases'; end if;

  update reports set ngo_id = my_ngo, status = 'In Progress', updated_at = now()
  where id = p_report and ngo_id is null and status = 'Pending';
  if not found then raise exception 'This case is no longer open'; end if;

  select name into ngo_name from ngos where id = my_ngo;
  insert into report_updates (report_id, status, note, actor_id, actor_label)
  values (p_report, 'In Progress', 'Case accepted by ' || ngo_name, auth.uid(), ngo_name);
end;
$$;

-- NGO (for its own cases) or admin (any case) changes the status.
create or replace function public.update_report_status(p_report uuid, p_status text, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  my_ngo uuid := my_ngo_id();
  label text;
  r reports;
begin
  if p_status not in ('Pending','In Progress','Resolved','Rejected') then
    raise exception 'Unknown status';
  end if;
  select * into r from reports where id = p_report;
  if not found then raise exception 'Report not found'; end if;

  if is_admin() then
    label := 'Admin';
  elsif my_ngo is not null and r.ngo_id = my_ngo then
    select name into label from ngos where id = my_ngo;
  else
    raise exception 'You are not allowed to update this report';
  end if;

  update reports set status = p_status, updated_at = now() where id = p_report;
  insert into report_updates (report_id, status, note, actor_id, actor_label)
  values (p_report, p_status, left(coalesce(p_note, ''), 500), auth.uid(), label);
end;
$$;

-- NGO hands a case back to the open pool.
create or replace function public.ngo_release_report(p_report uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  my_ngo uuid := my_ngo_id();
  ngo_name text;
begin
  update reports set ngo_id = null, status = 'Pending', updated_at = now()
  where id = p_report and ngo_id = my_ngo and my_ngo is not null;
  if not found then raise exception 'You are not allowed to release this report'; end if;
  select name into ngo_name from ngos where id = my_ngo;
  insert into report_updates (report_id, status, note, actor_id, actor_label)
  values (p_report, 'Pending', 'Released back to the open pool by ' || ngo_name, auth.uid(), ngo_name);
end;
$$;

-- Admin assigns (or unassigns, with null) an NGO.
create or replace function public.admin_assign_report(p_report uuid, p_ngo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  ngo_name text;
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if p_ngo is not null then
    select name into ngo_name from ngos where id = p_ngo and status = 'approved';
    if ngo_name is null then raise exception 'NGO is not approved'; end if;
  end if;

  update reports
     set ngo_id = p_ngo,
         status = case when p_ngo is null then 'Pending'
                       when status = 'Pending' then 'In Progress' else status end,
         updated_at = now()
   where id = p_report;
  if not found then raise exception 'Report not found'; end if;

  insert into report_updates (report_id, status, note, actor_id, actor_label)
  select p_report, status,
         case when p_ngo is null then 'Unassigned by admin' else 'Assigned to ' || ngo_name || ' by admin' end,
         auth.uid(), 'Admin'
  from reports where id = p_report;
end;
$$;

-- Admin approves / suspends an NGO.
create or replace function public.admin_set_ngo_status(p_ngo uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if p_status not in ('pending','approved','suspended') then raise exception 'Unknown status'; end if;
  update ngos set status = p_status where id = p_ngo;
  if not found then raise exception 'NGO not found'; end if;
end;
$$;

revoke execute on all functions in schema public from public;
grant execute on function public.submit_report(text,text,text,text,text,text,text,double precision,double precision) to anon, authenticated;
grant execute on function public.track_report(text) to anon, authenticated;
grant execute on function public.ngo_accept_report(uuid) to authenticated;
grant execute on function public.update_report_status(uuid,text,text) to authenticated;
grant execute on function public.ngo_release_report(uuid) to authenticated;
grant execute on function public.admin_assign_report(uuid,uuid) to authenticated;
grant execute on function public.admin_set_ngo_status(uuid,text) to authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.my_ngo_id() to anon, authenticated;
grant execute on function public.can_see_report(public.reports) to anon, authenticated;

-- -------------------------------------------------------------------------
-- Photo storage: public bucket, images only, 5 MB max.
-- Uploads must go to reports/<random>.<ext>; nobody can overwrite or delete
-- except admins.
-- -------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', true, 5242880,
        array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "report photos upload" on storage.objects;
create policy "report photos upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'report-photos' and name ~ '^reports/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp|gif)$');

drop policy if exists "report photos admin delete" on storage.objects;
create policy "report photos admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'report-photos' and public.is_admin());

-- -------------------------------------------------------------------------
-- Make yourself the first admin
-- 1. Register on the website as a normal citizen.
-- 2. Run this line here with your email address:
--
--    update public.profiles set role = 'admin' where email = 'you@example.com';
-- -------------------------------------------------------------------------
