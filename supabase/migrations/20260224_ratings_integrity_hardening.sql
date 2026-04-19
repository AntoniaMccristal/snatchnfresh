-- Extra integrity checks for ratings against bookings
-- Enforces field consistency and prevents rating non-eligible bookings.

create or replace function public.validate_rating_booking_consistency()
returns trigger
language plpgsql
as $$
declare
  b record;
begin
  select id, item_id, renter_id, owner_id, status
    into b
  from public.bookings
  where id = new.booking_id;

  if b.id is null then
    raise exception 'Booking % does not exist', new.booking_id;
  end if;

  if b.item_id <> new.item_id then
    raise exception 'Rating item_id must match booking item_id';
  end if;

  if b.renter_id <> new.rater_id then
    raise exception 'Only the renter can rate this booking';
  end if;

  if b.owner_id <> new.rated_user_id then
    raise exception 'rated_user_id must be booking owner_id';
  end if;

  if b.status not in ('approved', 'paid', 'completed', 'returned') then
    raise exception 'Booking status % is not eligible for rating', b.status;
  end if;

  if tg_op = 'UPDATE' then
    if old.booking_id <> new.booking_id
      or old.item_id <> new.item_id
      or old.rater_id <> new.rater_id
      or old.rated_user_id <> new.rated_user_id then
      raise exception 'booking_id, item_id, rater_id, and rated_user_id are immutable';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists ratings_validate_booking_consistency on public.ratings;
create trigger ratings_validate_booking_consistency
before insert or update on public.ratings
for each row
execute function public.validate_rating_booking_consistency();
