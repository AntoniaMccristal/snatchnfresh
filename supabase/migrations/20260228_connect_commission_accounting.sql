-- Stripe Connect + commission accounting fields

alter table public.profiles
  add column if not exists stripe_account_id text,
  add column if not exists stripe_connect_account_id text;

alter table public.bookings
  add column if not exists rental_subtotal numeric,
  add column if not exists platform_commission_amount numeric,
  add column if not exists lender_payout_amount numeric,
  add column if not exists commission_rate numeric,
  add column if not exists stripe_transfer_destination text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text;

create index if not exists bookings_stripe_checkout_session_id_idx
  on public.bookings(stripe_checkout_session_id);

create index if not exists bookings_stripe_payment_intent_id_idx
  on public.bookings(stripe_payment_intent_id);
