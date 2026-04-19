-- Permit owner tracking/return updates while keeping payment and payout writes server-side.

alter table public.bookings
  add column if not exists stripe_transfer_id text;

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
    raise exception 'only owner can update booking';
  end if;

  if coalesce(request_role, '') <> 'service_role' then
    -- Owner can only manage booking decision + delivery lifecycle details.
    if new.item_id is distinct from old.item_id
      or new.owner_id is distinct from old.owner_id
      or new.renter_id is distinct from old.renter_id
      or new.start_date is distinct from old.start_date
      or new.end_date is distinct from old.end_date
      or new.total_price is distinct from old.total_price
      or coalesce(new.delivery_method, '') is distinct from coalesce(old.delivery_method, '')
      or coalesce(new.rental_subtotal, 0) is distinct from coalesce(old.rental_subtotal, 0)
      or coalesce(new.shipping_amount, 0) is distinct from coalesce(old.shipping_amount, 0)
      or coalesce(new.insurance_amount, 0) is distinct from coalesce(old.insurance_amount, 0)
      or coalesce(new.platform_commission_amount, 0) is distinct from coalesce(old.platform_commission_amount, 0)
      or coalesce(new.lender_payout_amount, 0) is distinct from coalesce(old.lender_payout_amount, 0)
      or coalesce(new.commission_rate, 0) is distinct from coalesce(old.commission_rate, 0)
      or coalesce(new.stripe_transfer_destination, '') is distinct from coalesce(old.stripe_transfer_destination, '')
      or coalesce(new.stripe_checkout_session_id, '') is distinct from coalesce(old.stripe_checkout_session_id, '')
      or coalesce(new.stripe_payment_intent_id, '') is distinct from coalesce(old.stripe_payment_intent_id, '')
      or coalesce(new.stripe_transfer_id, '') is distinct from coalesce(old.stripe_transfer_id, '')
      or coalesce(new.paid_at::text, '') is distinct from coalesce(old.paid_at::text, '')
      or coalesce(new.payout_status, '') is distinct from coalesce(old.payout_status, '')
      or coalesce(new.payout_hold_reason, '') is distinct from coalesce(old.payout_hold_reason, '')
      or coalesce(new.payout_released_at::text, '') is distinct from coalesce(old.payout_released_at::text, '')
      or coalesce(new.dispute_window_ends_at::text, '') is distinct from coalesce(old.dispute_window_ends_at::text, '')
      or coalesce(new.tracking_required, false) is distinct from coalesce(old.tracking_required, false) then
      raise exception 'owner may only update booking status, tracking_number, tracking_status, delivered_at, item_returned_at';
    end if;
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

  if coalesce(new.tracking_status, 'pending') = 'delivered'
    and nullif(coalesce(new.tracking_number, ''), '') is null then
    raise exception 'tracking number is required when marking delivered';
  end if;

  return new;
end;
$$;
