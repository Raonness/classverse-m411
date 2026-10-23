-- Run in Supabase SQL Editor. Independent from the old reservation tables.
create table if not exists public.seatmap_seats (
 seat_id text primary key, student_name text, student_number integer unique,
 constraint seatmap_name_number_together check ((student_name is null and student_number is null) or (student_name is not null and length(trim(student_name))>0 and student_number between 1 and 99))
);
insert into public.seatmap_seats(seat_id)
select unnest(array['A1','A2','A3','A4','A5','B1','B2','B3','B4','B5','C1','C2','C3','C4','C5','D1','D2','D3','D4','D5','E1','E2','E3','E4','E5','E6','F1','F2','F3','F4','F5','F6','G2','G3','G6','H2','H6','I2','J2','J3']) on conflict do nothing;
create table if not exists public.seatmap_admins (user_id uuid primary key references auth.users(id));
create table if not exists public.seatmap_swap_requests (
 id uuid primary key default gen_random_uuid(), requester_name text not null, requester_number integer not null,
 from_seat text not null, to_seat text not null, reason text not null default '',
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(), decided_at timestamptz
);
alter table public.seatmap_seats enable row level security;
alter table public.seatmap_admins enable row level security;
alter table public.seatmap_swap_requests enable row level security;
revoke all on public.seatmap_seats, public.seatmap_admins, public.seatmap_swap_requests from anon,authenticated;
create or replace function public.seatmap_is_admin() returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from public.seatmap_admins where user_id=auth.uid()) $$;
create or replace function public.seatmap_public_snapshot() returns table(seat_id text,student_name text,student_number integer) language sql stable security definer set search_path = '' as $$select seat_id,student_name,student_number from public.seatmap_seats where student_name is not null order by seat_id$$;
create or replace function public.seatmap_request_swap(p_name text,p_number integer,p_target text,p_reason text default '') returns uuid language plpgsql security definer set search_path = '' as $$
declare source_seat text; rid uuid;
begin
 if length(trim(coalesce(p_name,'')))<2 or length(p_name)>80 or length(coalesce(p_reason,''))>300 then raise exception 'Invalid request'; end if;
 select seat_id into source_seat from public.seatmap_seats where student_name=trim(p_name) and student_number=p_number;
 if source_seat is null then raise exception 'Student not found'; end if;
 if source_seat=p_target or not exists(select 1 from public.seatmap_seats where seat_id=p_target and student_name is not null) then raise exception 'Invalid target seat'; end if;
 if exists(select 1 from public.seatmap_swap_requests where requester_number=p_number and status='pending') then raise exception 'There is already a pending request'; end if;
 insert into public.seatmap_swap_requests(requester_name,requester_number,from_seat,to_seat,reason) values(trim(p_name),p_number,source_seat,p_target,coalesce(p_reason,'')) returning id into rid;
 return rid;
end$$;
create or replace function public.seatmap_admin_requests() returns setof public.seatmap_swap_requests language plpgsql security definer set search_path = '' as $$begin
 if not public.seatmap_is_admin() then raise exception 'Admin only'; end if;
 return query select * from public.seatmap_swap_requests where status='pending' order by created_at;
end$$;
create or replace function public.seatmap_admin_assign(p_seat text,p_name text,p_number integer) returns void language plpgsql security definer set search_path = '' as $$begin
 if not public.seatmap_is_admin() then raise exception 'Admin only'; end if;
 if not exists(select 1 from public.seatmap_seats where seat_id=p_seat) then raise exception 'Invalid seat'; end if;
 if trim(coalesce(p_name,''))='' then update public.seatmap_seats set student_name=null,student_number=null where seat_id=p_seat;
 else
  if length(p_name)>80 or p_number is null then raise exception 'Invalid student'; end if;
  -- Moving an existing student to a new seat clears their previous seat.
  update public.seatmap_seats set student_name=null,student_number=null where student_number=p_number and seat_id<>p_seat;
  update public.seatmap_seats set student_name=trim(p_name),student_number=p_number where seat_id=p_seat;
 end if;
end$$;
create or replace function public.seatmap_admin_decide(p_id uuid,p_approve boolean) returns void language plpgsql security definer set search_path = '' as $$
declare req public.seatmap_swap_requests%rowtype; a public.seatmap_seats%rowtype; b public.seatmap_seats%rowtype;
begin
 if not public.seatmap_is_admin() then raise exception 'Admin only'; end if;
 select * into req from public.seatmap_swap_requests where id=p_id and status='pending' for update;
 if not found then raise exception 'Request already processed'; end if;
 if p_approve then
  perform 1 from public.seatmap_seats where seat_id in (req.from_seat,req.to_seat) order by seat_id for update;
  select * into a from public.seatmap_seats where seat_id=req.from_seat;
  select * into b from public.seatmap_seats where seat_id=req.to_seat;
  if a.student_name is distinct from req.requester_name or a.student_number is distinct from req.requester_number or b.student_name is null then raise exception 'Seating changed; request must be reviewed again'; end if;
  -- Two-step update avoids transient unique student_number conflict.
  update public.seatmap_seats set student_name=null,student_number=null where seat_id in (req.from_seat,req.to_seat);
  update public.seatmap_seats set student_name=b.student_name,student_number=b.student_number where seat_id=req.from_seat;
  update public.seatmap_seats set student_name=a.student_name,student_number=a.student_number where seat_id=req.to_seat;
 end if;
 update public.seatmap_swap_requests set status=case when p_approve then 'approved' else 'rejected' end,decided_at=now() where id=p_id;
end$$;
revoke all on function public.seatmap_is_admin() from public;
revoke all on function public.seatmap_public_snapshot() from public;
revoke all on function public.seatmap_request_swap(text,integer,text,text) from public;
revoke all on function public.seatmap_admin_requests() from public;
revoke all on function public.seatmap_admin_assign(text,text,integer) from public;
revoke all on function public.seatmap_admin_decide(uuid,boolean) from public;
grant execute on function public.seatmap_public_snapshot() to anon,authenticated;
grant execute on function public.seatmap_request_swap(text,integer,text,text) to anon,authenticated;
grant execute on function public.seatmap_admin_requests() to authenticated;
grant execute on function public.seatmap_admin_assign(text,text,integer) to authenticated;
grant execute on function public.seatmap_admin_decide(uuid,boolean) to authenticated;
-- After creating the sole admin in Supabase Auth, run separately:
-- insert into public.seatmap_admins(user_id) values ('REPLACE-WITH-ADMIN-AUTH-USER-UUID');
-- Do not add any other users to seatmap_admins.
