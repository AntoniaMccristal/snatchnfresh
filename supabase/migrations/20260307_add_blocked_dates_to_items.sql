alter table public.items
add column if not exists blocked_dates jsonb default '[]'::jsonb;
