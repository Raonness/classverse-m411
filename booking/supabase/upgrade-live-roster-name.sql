-- ClassroomHub: require exact roster name + number for LIVE bookings.
-- Run this migration once in the booking Supabase project (ihpceliqxmaqwmletuht).
-- Students continue to use anonymous sessions; only admins need verified Auth accounts.
-- Existing roster rows receive a blank name and must be edited in the Admin roster tab
-- before those students can book in LIVE mode.

begin;

alter table public.student_roster
  add column if not exists student_name text not null default '';
alter table public.student_roster
  alter column email drop not null;

create or replace function public.confirm_seat(
  p_seat text, p_name text, p_number text default '', p_for_other boolean default false
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_mode text;
  v_opens timestamptz;
  v_user uuid := auth.uid();
  v_no text := btrim(coalesce(p_number,''));
  v_name text := btrim(coalesce(p_name,''));
begin
  if v_user is null then
    return jsonb_build_object('ok',false,'error','กรุณาเข้าสู่ระบบ');
  end if;
  if char_length(v_name) not between 1 and 80
     or (v_no <> '' and v_no !~ '^[0-9]{1,3}$') then
    return jsonb_build_object('ok',false,'error','ข้อมูลไม่ถูกต้อง');
  end if;

  perform pg_advisory_xact_lock(4242427001);
  select mode, case when mode='test' then test_opens_at else live_opens_at end
    into v_mode, v_opens
  from public.classroom_control where id=1;

  if clock_timestamp() < v_opens then
    return jsonb_build_object('ok',false,'error','ยังไม่ถึงเวลาเปิดจอง');
  end if;
  if v_no = '' then
    return jsonb_build_object('ok',false,'error','กรุณาระบุเลขที่นักเรียน');
  end if;

  if v_mode = 'live' and not exists (
    select 1 from public.student_roster r
    where r.student_number = v_no
      and lower(btrim(r.student_name)) = lower(v_name)
  ) then
    return jsonb_build_object('ok',false,'error','ชื่อและเลขที่ไม่ตรงกับรายชื่อนักเรียน');
  end if;

  if not exists(select 1 from public.seat_catalog where seat_id=p_seat and enabled) then
    return jsonb_build_object('ok',false,'error','ที่นั่งปิดใช้งาน');
  end if;
  if not exists(
    select 1 from public.seat_holds
    where mode=v_mode and seat_id=p_seat and owner_id=v_user
      and expires_at > clock_timestamp()
  ) then
    return jsonb_build_object('ok',false,'error','หมดเวลาล็อก กรุณาเลือกใหม่');
  end if;
  if exists(
    select 1 from public.seat_bookings
    where mode=v_mode and (
      seat_id=p_seat
      or (not p_for_other and owner_id=v_user and booked_for='self')
      or student_number=v_no
    )
  ) then
    return jsonb_build_object('ok',false,'error','เลขที่หรือที่นั่งนี้จองแล้ว หรือคุณมีที่นั่งของตัวเองแล้ว');
  end if;

  insert into public.seat_bookings(
    mode,seat_id,owner_id,student_name,student_number,booked_for
  ) values (
    v_mode,p_seat,v_user,v_name,v_no,case when p_for_other then 'other' else 'self' end
  );
  delete from public.seat_holds where mode=v_mode and owner_id=v_user;
  perform public.bump_classroom_signal();
  return jsonb_build_object('ok',true,'seat_id',p_seat);
end
$$;

create or replace function public.admin_snapshot() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_mode text;
  v_result jsonb;
begin
  if not public.is_classroom_admin() then
    raise exception 'permission denied: admin only' using errcode='42501';
  end if;
  select mode into v_mode from public.classroom_control where id=1;
  select public.public_snapshot() || jsonb_build_object(
    'reservations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'seat_id',seat_id,'student_name',student_name,
        'student_number',student_number,'booked_at',booked_at
      ) order by seat_id)
      from public.seat_bookings where mode=v_mode
    ),'[]'::jsonb),
    'roster', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_number',student_number,'student_name',student_name,'email',email
      ) order by student_number)
      from public.student_roster
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end
$$;

drop function if exists public.admin_upsert_roster(text,text);
create or replace function public.admin_upsert_roster(
  p_number text, p_name text, p_email text default null
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name,''));
  v_email text := nullif(lower(btrim(coalesce(p_email,''))),'');
begin
  if not public.is_classroom_admin() then
    raise exception 'admin only' using errcode='42501';
  end if;
  if p_number is null or p_number !~ '^[0-9]{1,3}$'
     or char_length(v_name) not between 1 and 80
     or (v_email is not null and (
       char_length(v_email)>254 or v_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$'
     )) then
    return false;
  end if;

  perform pg_advisory_xact_lock(4242427001);
  if v_email is not null then
    delete from public.student_roster
    where email=v_email and student_number<>p_number;
  end if;
  insert into public.student_roster(student_number,student_name,email)
  values(p_number,v_name,v_email)
  on conflict(student_number) do update
  set student_name=excluded.student_name,
      email=coalesce(excluded.email,public.student_roster.email);
  perform public.bump_classroom_signal();
  return true;
end
$$;

revoke all on function public.confirm_seat(text,text,text,boolean) from public,anon;
revoke all on function public.admin_snapshot() from public,anon;
revoke all on function public.admin_upsert_roster(text,text,text) from public,anon;
grant execute on function public.confirm_seat(text,text,text,boolean) to authenticated;
grant execute on function public.admin_snapshot() to authenticated;
grant execute on function public.admin_upsert_roster(text,text,text) to authenticated;

commit;
