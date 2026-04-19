-- Require AAL2 for sensitive item mutations + backup recovery codes storage.

create extension if not exists pgcrypto;

create table if not exists public.mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create unique index if not exists mfa_recovery_codes_user_hash_idx
  on public.mfa_recovery_codes(user_id, code_hash);

create index if not exists mfa_recovery_codes_user_unused_idx
  on public.mfa_recovery_codes(user_id)
  where used_at is null;

alter table public.mfa_recovery_codes enable row level security;

drop policy if exists "mfa_recovery_codes_none_select" on public.mfa_recovery_codes;
drop policy if exists "mfa_recovery_codes_none_insert" on public.mfa_recovery_codes;
drop policy if exists "mfa_recovery_codes_none_update" on public.mfa_recovery_codes;
drop policy if exists "mfa_recovery_codes_none_delete" on public.mfa_recovery_codes;

create policy "mfa_recovery_codes_none_select"
  on public.mfa_recovery_codes
  for select
  to authenticated
  using (false);

create policy "mfa_recovery_codes_none_insert"
  on public.mfa_recovery_codes
  for insert
  to authenticated
  with check (false);

create policy "mfa_recovery_codes_none_update"
  on public.mfa_recovery_codes
  for update
  to authenticated
  using (false)
  with check (false);

create policy "mfa_recovery_codes_none_delete"
  on public.mfa_recovery_codes
  for delete
  to authenticated
  using (false);

-- Tighten sensitive item mutations: only owner with aal2 can update/delete.
do $$
declare
  has_owner_id boolean;
  has_user_id boolean;
  owner_expr text;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'items' and column_name = 'owner_id'
  ) into has_owner_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'items' and column_name = 'user_id'
  ) into has_user_id;

  if has_owner_id and has_user_id then
    owner_expr := 'coalesce(owner_id, user_id)';
  elsif has_owner_id then
    owner_expr := 'owner_id';
  elsif has_user_id then
    owner_expr := 'user_id';
  else
    raise exception 'items table must contain owner_id or user_id for ownership RLS';
  end if;

  execute 'drop policy if exists "items_update_owner_only" on public.items';
  execute 'drop policy if exists "items_delete_owner_only" on public.items';

  execute format(
    'create policy "items_update_owner_only" on public.items for update to authenticated using (auth.uid() = %s and coalesce(auth.jwt()->>''aal'',''aal1'') = ''aal2'') with check (auth.uid() = %s and coalesce(auth.jwt()->>''aal'',''aal1'') = ''aal2'')',
    owner_expr,
    owner_expr
  );

  execute format(
    'create policy "items_delete_owner_only" on public.items for delete to authenticated using (auth.uid() = %s and coalesce(auth.jwt()->>''aal'',''aal1'') = ''aal2'')',
    owner_expr
  );
end
$$;

