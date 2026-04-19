-- Profile contact fields for onboarding after verification

alter table public.profiles
  add column if not exists phone text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists suburb text,
  add column if not exists state text,
  add column if not exists postcode text,
  add column if not exists country text;
