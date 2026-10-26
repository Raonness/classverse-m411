-- ClassVerse M.4/11: allow a student to request moving into an empty seat.
-- Safe/additive: does not delete existing seats, students, or requests.
-- Applied to the classverse-m411 Supabase project on 2026-10-26.

create or replace function public.seatmap_request_swap(p_name text,p_number integer,p_target text,p_reason text default '') returns uuid language plpgsql security definer set search_path = '' as $$
declare source_seat text; rid uuid;
begin
 if length(trim(coalesce(p_name,'')))<2 or length(p_name)>80 or length(coalesce(p_reason,''))>300 then raise exception 'Invalid request'; end if;
 select seat_id into source_seat from public.seatmap_seats where student_name=trim(p_name) and student_number=p_number;
 if source_seat is null then raise exception 'Student not found'; end if;
 if not exists(select 1 from public.seatmap_seats where seat_id=p_target) then raise exception 'Invalid target seat'; end if;
 if source_seat=p_target then raise exception 'Invalid target seat'; end if;
 if exists(select 1 from public.seatmap_swap_requests where requester_number=p_number and status='pending') then raise exception 'There is already a pending request'; end if;
 insert into public.seatmap_swap_requests(requester_name,requester_number,from_seat,to_seat,reason) values(trim(p_name),p_number,source_seat,p_target,coalesce(p_reason,'')) returning id into rid;
 return rid;
end$$;
revoke all on function public.seatmap_request_swap(text,integer,text,text) from public;
grant execute on function public.seatmap_request_swap(text,integer,text,text) to anon,authenticated;

create or replace function public.seatmap_admin_decide(p_id uuid,p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
 req public.seatmap_swap_requests%rowtype;
 a public.seatmap_seats%rowtype;
 b public.seatmap_seats%rowtype;
begin
 if not public.seatmap_is_admin() then raise exception 'Admin only'; end if;
 select * into req from public.seatmap_swap_requests where id=p_id and status='pending' for update;
 if not found then raise exception 'Request already processed'; end if;
 if p_approve then
  perform 1 from public.seatmap_seats where seat_id in (req.from_seat,req.to_seat) order by seat_id for update;
  select * into a from public.seatmap_seats where seat_id=req.from_seat;
  select * into b from public.seatmap_seats where seat_id=req.to_seat;
  if a.student_name is distinct from req.requester_name or a.student_number is distinct from req.requester_number then
    raise exception 'Seating changed; request must be reviewed again';
  end if;
  if b.student_name is null then
    update public.seatmap_seats set student_name=null,student_number=null,nickname=null,birth_date=null where seat_id=req.from_seat;
    update public.seatmap_seats set student_name=a.student_name,student_number=a.student_number,nickname=a.nickname,birth_date=a.birth_date where seat_id=req.to_seat;
  else
    update public.seatmap_seats set student_name=null,student_number=null,nickname=null,birth_date=null where seat_id in (req.from_seat,req.to_seat);
    update public.seatmap_seats set student_name=b.student_name,student_number=b.student_number,nickname=b.nickname,birth_date=b.birth_date where seat_id=req.from_seat;
    update public.seatmap_seats set student_name=a.student_name,student_number=a.student_number,nickname=a.nickname,birth_date=a.birth_date where seat_id=req.to_seat;
  end if;
 end if;
 update public.seatmap_swap_requests set status=case when p_approve then 'approved' else 'rejected' end,decided_at=now() where id=p_id;
end$$;
revoke all on function public.seatmap_admin_decide(uuid,boolean) from public,anon,authenticated;
grant execute on function public.seatmap_admin_decide(uuid,boolean) to authenticated;
