-- Renter-paid protection fee accounting fields

alter table public.bookings
  add column if not exists base_price numeric,
  add column if not exists protection_fee numeric,
  add column if not exists platform_fee numeric;
