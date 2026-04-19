-- Shipping options + payout hold protection model

alter table public.items
  add column if not exists standard_shipping_price numeric not null default 0,
  add column if not exists express_shipping_price numeric not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'items_standard_shipping_non_negative'
  ) then
    alter table public.items
      add constraint items_standard_shipping_non_negative
      check (standard_shipping_price >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'items_express_shipping_non_negative'
  ) then
    alter table public.items
      add constraint items_express_shipping_non_negative
      check (express_shipping_price >= 0);
  end if;
end
$$;

alter table public.bookings
  add column if not exists shipping_amount numeric not null default 0,
  add column if not exists insurance_amount numeric not null default 0,
  add column if not exists tracking_required boolean not null default false,
  add column if not exists tracking_number text,
  add column if not exists tracking_status text not null default 'pending',
  add column if not exists delivered_at timestamptz,
  add column if not exists item_returned_at timestamptz,
  add column if not exists dispute_window_ends_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists payout_status text not null default 'held',
  add column if not exists payout_hold_reason text,
  add column if not exists payout_released_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_shipping_amount_non_negative'
  ) then
    alter table public.bookings
      add constraint bookings_shipping_amount_non_negative
      check (shipping_amount >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'bookings_insurance_amount_non_negative'
  ) then
    alter table public.bookings
      add constraint bookings_insurance_amount_non_negative
      check (insurance_amount >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'bookings_delivery_method_allowed'
  ) then
    alter table public.bookings
      add constraint bookings_delivery_method_allowed
      check (
        delivery_method is null
        or delivery_method in (
          'pickup',
          'standard_shipping',
          'express_shipping',
          'seller_dropoff',
          'uber_parcel'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'bookings_tracking_status_allowed'
  ) then
    alter table public.bookings
      add constraint bookings_tracking_status_allowed
      check (tracking_status in ('pending', 'in_transit', 'delivered'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'bookings_payout_status_allowed'
  ) then
    alter table public.bookings
      add constraint bookings_payout_status_allowed
      check (payout_status in ('held', 'releasing', 'released'));
  end if;
end
$$;

create index if not exists bookings_tracking_required_idx
  on public.bookings(tracking_required);

create index if not exists bookings_payout_status_idx
  on public.bookings(payout_status);

create or replace function public.refresh_booking_dispute_window()
returns trigger
language plpgsql
as $$
declare
  base_ts timestamptz;
begin
  base_ts := greatest(
    coalesce(new.item_returned_at, to_timestamp(0)),
    coalesce((new.end_date::timestamp at time zone 'UTC'), to_timestamp(0))
  );

  if base_ts > to_timestamp(0) then
    new.dispute_window_ends_at := base_ts + interval '24 hours';
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_refresh_dispute_window on public.bookings;
create trigger bookings_refresh_dispute_window
before insert or update on public.bookings
for each row
execute function public.refresh_booking_dispute_window();

create or replace function public.booking_payout_releasable(
  p_booking public.bookings
)
returns boolean
language sql
stable
as $$
  select
    p_booking.status in ('paid', 'completed')
    and (now() >= (p_booking.end_date::timestamp at time zone 'UTC'))
    and p_booking.item_returned_at is not null
    and now() >= coalesce(
      p_booking.dispute_window_ends_at,
      greatest(
        p_booking.item_returned_at,
        (p_booking.end_date::timestamp at time zone 'UTC')
      ) + interval '24 hours'
    )
    and (
      coalesce(p_booking.tracking_required, false) = false
      or (
        nullif(coalesce(p_booking.tracking_number, ''), '') is not null
        and p_booking.tracking_status = 'delivered'
      )
    );
$$;
