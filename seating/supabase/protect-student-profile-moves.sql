-- ClassVerse seat-map data-safety upgrade (NEW Supabase project only).
-- Does not delete existing student rows or modify any stored data when run.
-- Replaces the admin assignment function to preserve nicknames/birthdays during moves
-- and to reject overwriting an occupied destination.
begin;
create or replace function public.seatmap_admin_assign_profile(
 p_seat text, p_name text, p_number integer,
 p_nickname text default null, p_birthday date default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
 v_name text := nullif(trim(coalesce(p_name,'')),'');
 v_nick text := nullif(trim(coalesce(p_nickname,'')),'');
 v_old public.seatmap_seats%rowtype;
 v_dest public.seatmap_seats%rowtype;
begin
 if not public.seatmap_is_admin() then
   raise exception 'Admin only' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(55224411);
 select * into v_dest from public.seatmap_seats where seat_id=p_seat for update;
 if not found then raise exception 'Invalid seat'; end if;

 if v_name is null then
   -- Explicit clearing only, not a side effect of moving someone else.
   update public.seatmap_seats
   set student_name=null,student_number=null,nickname=null,birth_date=null
   where seat_id=p_seat;
   return;
 end if;

 if char_length(v_name)>80 or p_number is null or p_number not between 1 and 99
    or char_length(coalesce(v_nick,''))>40 then
   raise exception 'Invalid student profile';
 end if;

 -- Never silently remove the student already in a target seat.
 if v_dest.student_number is not null and v_dest.student_number<>p_number then
   raise exception 'This seat is occupied. Clear it deliberately, or approve a swap, before moving here';
 end if;

 select * into v_old from public.seatmap_seats
 where student_number=p_number and seat_id<>p_seat for update;

 if found then
   -- Carry private fields from student's former seat when client sends blanks.
   v_nick:=coalesce(v_nick,v_old.nickname);
   p_birthday:=coalesce(p_birthday,v_old.birth_date);
   update public.seatmap_seats
   set student_name=null,student_number=null,nickname=null,birth_date=null
   where seat_id=v_old.seat_id;
 end if;

 update public.seatmap_seats
 set student_name=v_name,student_number=p_number,nickname=v_nick,birth_date=p_birthday
 where seat_id=p_seat;
end$$;

revoke all on function public.seatmap_admin_assign_profile(text,text,integer,text,date)
from public,anon,authenticated;
grant execute on function public.seatmap_admin_assign_profile(text,text,integer,text,date)
to authenticated;
commit;
