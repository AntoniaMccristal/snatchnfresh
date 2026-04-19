-- Likes + Ratings schema for Snatchin marketplace
-- Safe to run multiple times.

create extension if not exists pgcrypto;

create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint likes_user_item_unique unique (user_id, item_id)
);

create index if not exists likes_user_id_idx on public.likes(user_id);
create index if not exists likes_item_id_idx on public.likes(item_id);

alter table public.likes enable row level security;

create policy if not exists "likes_select_own"
  on public.likes
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy if not exists "likes_insert_own"
  on public.likes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy if not exists "likes_delete_own"
  on public.likes
  for delete
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  rater_id uuid not null references auth.users(id) on delete cascade,
  rated_user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ratings_booking_rater_unique unique (booking_id, rater_id),
  constraint ratings_no_self_rating check (rater_id <> rated_user_id)
);

create index if not exists ratings_booking_id_idx on public.ratings(booking_id);
create index if not exists ratings_rater_id_idx on public.ratings(rater_id);
create index if not exists ratings_rated_user_id_idx on public.ratings(rated_user_id);

create or replace function public.set_ratings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ratings_set_updated_at on public.ratings;
create trigger ratings_set_updated_at
before update on public.ratings
for each row execute function public.set_ratings_updated_at();

alter table public.ratings enable row level security;

create policy if not exists "ratings_select_involved"
  on public.ratings
  for select
  to authenticated
  using (auth.uid() = rater_id or auth.uid() = rated_user_id);

create policy if not exists "ratings_insert_renter_for_owner"
  on public.ratings
  for insert
  to authenticated
  with check (
    auth.uid() = rater_id
    and exists (
      select 1
      from public.bookings b
      where b.id = booking_id
        and b.item_id = item_id
        and b.renter_id = auth.uid()
        and b.owner_id = rated_user_id
        and b.status in ('approved', 'paid', 'completed', 'returned')
    )
  );

create policy if not exists "ratings_update_own"
  on public.ratings
  for update
  to authenticated
  using (auth.uid() = rater_id)
  with check (auth.uid() = rater_id);

create policy if not exists "ratings_delete_own"
  on public.ratings
  for delete
  to authenticated
  using (auth.uid() = rater_id);
