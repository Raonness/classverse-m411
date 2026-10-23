-- ClassroomHub v10: migrate existing v9 database; do not rerun full schema.
-- Back up data first. Execute in Supabase SQL Editor as project owner.
BEGIN;
create or replace function public.hold_seat(p_seat text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_mode text; v_opens timestamptz; v_until timestamptz;
begin
 if v_user is null then return jsonb_build_object('ok',false,'error','กรุณาเข้าสู่ระบบ');end if;
 perform pg_advisory_xact_lock(4242427001);
 select mode,case when mode='test' then test_opens_at else live_opens_at end into v_mode,v_opens from public.classroom_control where id=1;
 if clock_timestamp()<v_opens then return jsonb_build_object('ok',false,'error','ยังไม่เปิดให้จอง');end if;
 if not exists(select 1 from public.seat_catalog where seat_id=p_seat and enabled=true) then return jsonb_build_object('ok',false,'error','ไม่มีที่นั่งนี้หรือปิดใช้งาน');end if;
 if exists(select 1 from public.seat_bookings where mode=v_mode and seat_id=p_seat) then return jsonb_build_object('ok',false,'error','ที่นั่งนี้มีผู้จองแล้ว');end if;
 delete from public.seat_holds where expires_at<=clock_timestamp();
 if exists(select 1 from public.seat_holds where mode=v_mode and seat_id=p_seat and owner_id<>v_user) then return jsonb_build_object('ok',false,'error','ที่นั่งนี้มีคนกำลังจองอยู่');end if;
 delete from public.seat_holds where mode=v_mode and owner_id=v_user;
 v_until=clock_timestamp()+interval '2 minutes';
 insert into public.seat_holds(mode,seat_id,owner_id,expires_at) values(v_mode,p_seat,v_user,v_until);
 perform public.bump_classroom_signal();
 return jsonb_build_object('ok',true,'expires_at',v_until);
end $$;

create or replace function public.confirm_seat(p_seat text,p_name text,p_number text default '',p_for_other boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_mode text; v_opens timestamptz; v_user uuid:=auth.uid();v_no text:=btrim(coalesce(p_number,''));v_name text:=btrim(coalesce(p_name,''));
begin
 if v_user is null then return jsonb_build_object('ok',false,'error','กรุณาเข้าสู่ระบบ');end if;
 if char_length(v_name) not between 1 and 80 or (v_no<>'' and v_no !~ '^[0-9]{1,3}$') then return jsonb_build_object('ok',false,'error','ข้อมูลไม่ถูกต้อง');end if;
 perform pg_advisory_xact_lock(4242427001);
 select mode,case when mode='test' then test_opens_at else live_opens_at end into v_mode,v_opens from public.classroom_control where id=1;
 if clock_timestamp()<v_opens then return jsonb_build_object('ok',false,'error','ยังไม่ถึงเวลาเปิดจอง');end if;
 if v_no='' then return jsonb_build_object('ok',false,'error','กรุณาระบุเลขที่นักเรียน');end if;
 if not exists(select 1 from public.seat_catalog where seat_id=p_seat and enabled) then return jsonb_build_object('ok',false,'error','ที่นั่งปิดใช้งาน');end if;
 if not exists(select 1 from public.seat_holds where mode=v_mode and seat_id=p_seat and owner_id=v_user and expires_at>clock_timestamp())
   then return jsonb_build_object('ok',false,'error','หมดเวลาล็อก กรุณาเลือกใหม่');end if;
 if exists(select 1 from public.seat_bookings where mode=v_mode and (seat_id=p_seat or (not p_for_other and owner_id=v_user and booked_for='self') or student_number=v_no))
   then return jsonb_build_object('ok',false,'error','เลขที่หรือที่นั่งนี้จองแล้ว หรือคุณมีที่นั่งของตัวเองแล้ว');end if;
 insert into public.seat_bookings(mode,seat_id,owner_id,student_name,student_number,booked_for) values(v_mode,p_seat,v_user,v_name,v_no,case when p_for_other then 'other' else 'self' end);
 delete from public.seat_holds where mode=v_mode and owner_id=v_user;
 perform public.bump_classroom_signal();
 return jsonb_build_object('ok',true,'seat_id',p_seat);
end $$;

create or replace function public.admin_set_mode(p_mode text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_classroom_admin() then raise exception 'admin only' using errcode='42501';end if;
 if p_mode not in ('test','live') then return false;end if;
 perform pg_advisory_xact_lock(4242427001);
 update public.classroom_control set mode=p_mode where id=1;
 delete from public.seat_holds where mode in ('test','live');
 perform public.bump_classroom_signal();return true;
end $$;

COMMIT;
