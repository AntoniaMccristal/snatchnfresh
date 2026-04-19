-- Auth + RLS hardening for Snatch'n
-- Enforces strict ownership and booking visibility/update rules.

create extension if not exists pgcrypto;

-- Profiles table for public identity metadata used across the app.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_username_idx on public.profiles(username);

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_profiles_updated_at();

-- Keep a profile row in sync at account creation.
create or replace function public.handle_new_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_profile();

-- Ensure RLS is enabled.
alter table public.items add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.items add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.items add column if not exists is_available boolean default true;

update public.items
set owner_id = user_id
where owner_id is null and user_id is not null;

update public.items
set user_id = owner_id
where user_id is null and owner_id is not null;

alter table public.bookings add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.bookings add column if not exists renter_id uuid references auth.users(id) on delete set null;
alter table public.bookings add column if not exists status text default 'pending';
alter table public.bookings add column if not exists delivery_method text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bookings_status_allowed'
  ) then
    alter table public.bookings
      add constraint bookings_status_allowed
      check (status in ('pending', 'approved', 'rejected', 'paid', 'cancelled', 'completed'));
  end if;
end
$$;

-- Backfill bookings ownership fields for legacy rows.
do $$
declare
  bookings_has_user_id boolean;
begin
  update public.bookings b
  set owner_id = coalesce(i.owner_id, i.user_id)
  from public.items i
  where i.id = b.item_id
    and b.owner_id is null;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bookings'
      and column_name = 'user_id'
  ) into bookings_has_user_id;

  if bookings_has_user_id then
    execute '
      update public.bookings
      set renter_id = user_id
      where renter_id is null and user_id is not null
    ';
  end if;
end
$$;

alter table public.profiles enable row level security;
alter table public.items enable row level security;
alter table public.bookings enable row level security;

-- Reset profile policies for deterministic behavior.
drop policy if exists "profiles_select_public" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;

create policy "profiles_select_public"
  on public.profiles
  for select
  to anon, authenticated
  using (true);

create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_delete_own"
  on public.profiles
  for delete
  to authenticated
  using (auth.uid() = id);

-- Item ownership policies support either owner_id or legacy user_id schemas.
do $$
declare
  has_owner_id boolean;
  has_user_id boolean;
  has_is_available boolean;
  owner_expr text;
  available_expr text;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'items' and column_name = 'owner_id'
  ) into has_owner_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'items' and column_name = 'user_id'
  ) into has_user_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'items' and column_name = 'is_available'
  ) into has_is_available;

  if has_owner_id and has_user_id then
    owner_expr := 'coalesce(owner_id, user_id)';
  elsif has_owner_id then
    owner_expr := 'owner_id';
  elsif has_user_id then
    owner_expr := 'user_id';
  else
    raise exception 'items table must contain owner_id or user_id for ownership RLS';
  end if;

  if has_is_available then
    available_expr := 'coalesce(is_available, true) = true';
  else
    available_expr := 'true';
  end if;

  execute 'drop policy if exists "items_select_available_or_owner" on public.items';
  execute 'drop policy if exists "items_insert_owner" on public.items';
  execute 'drop policy if exists "items_update_owner_only" on public.items';
  execute 'drop policy if exists "items_delete_owner_only" on public.items';

  execute format(
    'create policy "items_select_available_or_owner" on public.items for select to anon, authenticated using ((%s) or auth.uid() = %s)',
    available_expr,
    owner_expr
  );

  execute format(
    'create policy "items_insert_owner" on public.items for insert to authenticated with check (auth.uid() = %s)',
    owner_expr
  );

  execute format(
    'create policy "items_update_owner_only" on public.items for update to authenticated using (auth.uid() = %s) with check (auth.uid() = %s)',
    owner_expr,
    owner_expr
  );

  execute format(
    'create policy "items_delete_owner_only" on public.items for delete to authenticated using (auth.uid() = %s)',
    owner_expr
  );
end
$$;

-- Booking integrity validation (server-side in DB, do not trust frontend).
create or replace function public.has_booking_overlap(
  p_item_id uuid,
  p_start_date date,
  p_end_date date,
  p_exclude_booking_id uuid default null,
  p_statuses text[] default array['pending', 'approved', 'paid', 'completed']
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.bookings b
    where b.item_id = p_item_id
      and (p_exclude_booking_id is null or b.id <> p_exclude_booking_id)
      and b.status = any(p_statuses)
      and daterange(b.start_date::date, b.end_date::date, '[)')
          && daterange(p_start_date::date, p_end_date::date, '[)')
  );
$$;

create or replace function public.validate_booking_insert()
returns trigger
language plpgsql
as $$
declare
  item_owner_id uuid;
  item_user_id uuid;
  item_available boolean;
begin
  if new.start_date is null or new.end_date is null then
    raise exception 'start_date and end_date are required';
  end if;

  if new.end_date <= new.start_date then
    raise exception 'end_date must be after start_date';
  end if;

  select owner_id, user_id, coalesce(is_available, true)
    into item_owner_id, item_user_id, item_available
  from public.items
  where id = new.item_id;

  if coalesce(item_owner_id, item_user_id) is null then
    raise exception 'item owner is missing';
  end if;

  if item_available is false then
    raise exception 'item is not available';
  end if;

  if new.owner_id is distinct from coalesce(item_owner_id, item_user_id) then
    raise exception 'owner_id must match the item owner';
  end if;

  if new.renter_id = new.owner_id then
    raise exception 'renter cannot book own item';
  end if;

  if auth.uid() is distinct from new.renter_id then
    raise exception 'only renter can create booking';
  end if;

  if new.status is null then
    new.status = 'pending';
  end if;

  if new.status <> 'pending' then
    raise exception 'new booking must start in pending status';
  end if;

  if public.has_booking_overlap(new.item_id, new.start_date::date, new.end_date::date) then
    raise exception 'Selected dates overlap with an existing booking';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_booking_status_update_by_owner()
returns trigger
language plpgsql
as $$
declare
  request_role text;
begin
  request_role := current_setting('request.jwt.claim.role', true);

  if coalesce(new.status, '') not in ('pending', 'approved', 'rejected', 'paid', 'cancelled', 'completed') then
    raise exception 'invalid booking status';
  end if;

  if coalesce(request_role, '') <> 'service_role'
    and auth.uid() is distinct from old.owner_id then
    raise exception 'only owner can update booking status';
  end if;

  if new.item_id is distinct from old.item_id
    or new.owner_id is distinct from old.owner_id
    or new.renter_id is distinct from old.renter_id
    or new.start_date is distinct from old.start_date
    or new.end_date is distinct from old.end_date
    or new.total_price is distinct from old.total_price
    or coalesce(new.delivery_method, '') is distinct from coalesce(old.delivery_method, '') then
    raise exception 'only status updates are allowed on bookings';
  end if;

  if new.status = 'approved'
    and public.has_booking_overlap(
      old.item_id,
      old.start_date::date,
      old.end_date::date,
      old.id,
      array['approved', 'paid', 'completed']
    ) then
    raise exception 'Cannot approve due to overlapping approved/paid booking';
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_validate_insert on public.bookings;
create trigger bookings_validate_insert
before insert on public.bookings
for each row
execute function public.validate_booking_insert();

drop trigger if exists bookings_enforce_owner_status_update on public.bookings;
create trigger bookings_enforce_owner_status_update
before update on public.bookings
for each row
execute function public.enforce_booking_status_update_by_owner();

-- Reset booking policies for deterministic behavior.
drop policy if exists "bookings_select_renter_or_owner" on public.bookings;
drop policy if exists "bookings_insert_renter_only" on public.bookings;
drop policy if exists "bookings_update_owner_status_only" on public.bookings;

create policy "bookings_select_renter_or_owner"
  on public.bookings
  for select
  to authenticated
  using (auth.uid() = renter_id or auth.uid() = owner_id);

create policy "bookings_insert_renter_only"
  on public.bookings
  for insert
  to authenticated
  with check (auth.uid() = renter_id and renter_id <> owner_id);

create policy "bookings_update_owner_status_only"
  on public.bookings
  for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
