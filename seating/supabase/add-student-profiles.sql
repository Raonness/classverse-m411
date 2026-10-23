-- ClassVerse M.4/11: optional nickname + private birthday migration.
-- Run ONLY in the NEW seating Supabase project (uazwviifldjdqthizkem).
-- Additive migration: existing seats, names, student numbers and requests are preserved.
-- Birth dates are ONLY available through a verified-admin RPC; never expose via public snapshots.
begin;
alter table public.seatmap_seats add column if not exists nickname text;
alter table public.seatmap_seats add column if not exists birth_date date;

create or replace function public.seatmap_public_snapshot_v2()
returns table(seat_id text, student_name text, student_number integer, nickname text)
language sql stable security definer set search_path = '' as $$
 select s.seat_id, s.student_name, s.student_number, s.nickname
 from public.seatmap_seats s where s.student_name is not null order by s.seat_id;
$$;

create or replace function public.seatmap_admin_profiles()
returns table(seat_id text, nickname text, birth_date date)
language plpgsql stable security definer set search_path = '' as $$
begin
 if not public.seatmap_is_admin() then raise exception 'Admin only' using errcode='42501'; end if;
 return query
 select s.seat_id, s.nickname, s.birth_date
 from public.seatmap_seats s
 where s.student_name is not null
 order by s.seat_id;
end$$;

-- A single atomic admin update: changing a seat assignment moves optional profile fields.
create or replace function public.seatmap_admin_assign_profile(
 p_seat text, p_name text, p_number integer, p_nickname text default null, p_birthday date default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
 v_name text := nullif(trim(coalesce(p_name,'')),'');
 v_nick text := nullif(trim(coalesce(p_nickname,'')),'');
begin
 if not public.seatmap_is_admin() then raise exception 'Admin only' using errcode='42501'; end if;
 if not exists(select 1 from public.seatmap_seats where seat_id=p_seat) then raise exception 'Invalid seat'; end if;
 if v_name is null then
  update public.seatmap_seats
    set student_name=null, student_number=null, nickname=null, birth_date=null
    where seat_id=p_seat;
  return;
 end if;
 if char_length(v_name)>80 or p_number is null or p_number not between 1 and 99
    or char_length(coalesce(v_nick,''))>40 then raise exception 'Invalid student profile'; end if;
 perform pg_advisory_xact_lock(55224411);
 -- Moving the same number from its previous seat clears that seat and its private profile.
 update public.seatmap_seats
 set student_name=null, student_number=null, nickname=null, birth_date=null
 where student_number=p_number and seat_id<>p_seat;
 update public.seatmap_seats
 set student_name=v_name, student_number=p_number, nickname=v_nick, birth_date=p_birthday
 where seat_id=p_seat;
end$$;

-- Keep optional profile fields attached to students when an admin approves a seat swap.
create or replace function public.seatmap_admin_decide(p_id uuid,p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
 req public.seatmap_swap_requests%rowtype;
 a public.seatmap_seats%rowtype;
 b public.seatmap_seats%rowtype;
begin
 if not public.seatmap_is_admin() then raise exception 'Admin only' using errcode='42501'; end if;
 select * into req from public.seatmap_swap_requests where id=p_id and status='pending' for update;
 if not found then raise exception 'Request already processed'; end if;
 if p_approve then
  perform 1 from public.seatmap_seats where seat_id in (req.from_seat,req.to_seat) order by seat_id for update;
  select * into a from public.seatmap_seats where seat_id=req.from_seat;
  select * into b from public.seatmap_seats where seat_id=req.to_seat;
  if a.student_name is distinct from req.requester_name
     or a.student_number is distinct from req.requester_number
     or b.student_name is null then
    raise exception 'Seating changed; request must be reviewed again';
  end if;
  update public.seatmap_seats
  set student_name=null,student_number=null,nickname=null,birth_date=null
  where seat_id in (req.from_seat,req.to_seat);
  update public.seatmap_seats
  set student_name=b.student_name,student_number=b.student_number,
      nickname=b.nickname,birth_date=b.birth_date
  where seat_id=req.from_seat;
  update public.seatmap_seats
  set student_name=a.student_name,student_number=a.student_number,
      nickname=a.nickname,birth_date=a.birth_date
  where seat_id=req.to_seat;
 end if;
 update public.seatmap_swap_requests
 set status=case when p_approve then 'approved' else 'rejected' end,decided_at=now()
 where id=p_id;
end$$;

revoke all on function public.seatmap_public_snapshot_v2() from public, anon, authenticated;
revoke all on function public.seatmap_admin_profiles() from public, anon, authenticated;
revoke all on function public.seatmap_admin_assign_profile(text,text,integer,text,date) from public, anon, authenticated;
grant execute on function public.seatmap_public_snapshot_v2() to anon,authenticated;
grant execute on function public.seatmap_admin_profiles() to authenticated;
grant execute on function public.seatmap_admin_assign_profile(text,text,integer,text,date) to authenticated;
-- Same access as before for swap decisions.
revoke all on function public.seatmap_admin_decide(uuid,boolean) from public,anon,authenticated;
grant execute on function public.seatmap_admin_decide(uuid,boolean) to authenticated;
commit;
