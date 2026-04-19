-- Follows + public reviews visibility
-- Safe to run multiple times.

create extension if not exists pgcrypto;

-- 1) Follows table for profile social graph
create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint follows_unique_pair unique (follower_id, following_id),
  constraint follows_no_self check (follower_id <> following_id)
);

create index if not exists follows_follower_id_idx on public.follows(follower_id);
create index if not exists follows_following_id_idx on public.follows(following_id);

alter table public.follows enable row level security;

drop policy if exists "follows_select_public" on public.follows;
drop policy if exists "follows_insert_own" on public.follows;
drop policy if exists "follows_delete_own" on public.follows;

create policy "follows_select_public"
  on public.follows
  for select
  to anon, authenticated
  using (true);

create policy "follows_insert_own"
  on public.follows
  for insert
  to authenticated
  with check (
    auth.uid() = follower_id
    and follower_id <> following_id
  );

create policy "follows_delete_own"
  on public.follows
  for delete
  to authenticated
  using (auth.uid() = follower_id);

-- 2) Ratings read policy for public profile review pages
-- Keep write rules strict; only relax read visibility.
drop policy if exists "ratings_select_public" on public.ratings;

create policy "ratings_select_public"
  on public.ratings
  for select
  to anon, authenticated
  using (true);
