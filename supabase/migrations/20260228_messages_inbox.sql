-- Messaging table for renter/lender inbox

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists messages_sender_id_idx on public.messages(sender_id);
create index if not exists messages_receiver_id_idx on public.messages(receiver_id);
create index if not exists messages_created_at_idx on public.messages(created_at desc);

alter table public.messages enable row level security;

drop policy if exists "messages_select_involved" on public.messages;
drop policy if exists "messages_insert_sender" on public.messages;
drop policy if exists "messages_update_receiver_read" on public.messages;

create policy "messages_select_involved"
  on public.messages
  for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "messages_insert_sender"
  on public.messages
  for insert
  to authenticated
  with check (auth.uid() = sender_id and sender_id <> receiver_id);

create policy "messages_update_receiver_read"
  on public.messages
  for update
  to authenticated
  using (auth.uid() = receiver_id)
  with check (auth.uid() = receiver_id);
