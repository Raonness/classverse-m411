-- ClassroomHub v9. Prefer a NEW Supabase project. Take a backup before any upgrade.
-- Public TEST and LIVE data are isolated. All mutations happen in SECURITY DEFINER RPCs.
-- This is a starter template; test concurrency, email delivery, permissions, and backups before launch.
-- IMPORTANT: This script is intended for a NEW project. It does not migrate v4/v5/v6 tables.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.classroom_control (
 id integer primary key default 1 check (id=1),
 mode text not null default 'test' check(mode in ('test','live')),
 test_opens_at timestamptz not null default now()-interval '1 minute',
 live_opens_at timestamptz not null default now()+interval '1 day'
);
insert into public.classroom_control(id) values(1) on conflict do nothing;

create table if not exists public.seat_catalog (
 seat_id text primary key check (seat_id ~ '^[A-J][1-6]$'),
 enabled boolean not null default true
);
insert into public.seat_catalog(seat_id) select unnest(array[
 'A1','A2','A3','A4','A5','B1','B2','B3','B4','B5',
 'C1','C2','C3','C4','C5','D1','D2','D3','D4','D5',
 'E1','E2','E3','E4','E5','E6','F1','F2','F3','F4','F5','F6',
 'G2','G3','G6','H2','H6','I2','J2','J3'
]) on conflict do nothing;

create table if not exists public.seat_holds (
 mode text not null check(mode in ('test','live')),
 seat_id text not null references public.seat_catalog(seat_id),
 owner_id uuid not null,
 expires_at timestamptz not null,
 primary key(mode,seat_id),
 unique(mode,owner_id)
);
create index if not exists holds_expires_idx on public.seat_holds(expires_at);
create table if not exists public.seat_bookings (
 mode text not null check(mode in ('test','live')),
 seat_id text not null references public.seat_catalog(seat_id),
 owner_id uuid not null,
 student_name text not null check(char_length(btrim(student_name)) between 1 and 80),
 student_number text not null default '' check(char_length(student_number)<=3),
 booked_at timestamptz not null default now(),
 booked_for text not null default 'self' check(booked_for in ('self','other')),
 primary key(mode,seat_id)
);
-- v7 -> v8 migration-compatible changes: retain existing bookings as self bookings.
alter table public.seat_bookings add column if not exists booked_for text not null default 'self';
do $$begin
 if not exists(select 1 from pg_constraint where conname='seat_bookings_booked_for_check' and conrelid='public.seat_bookings'::regclass) then
  alter table public.seat_bookings add constraint seat_bookings_booked_for_check check(booked_for in ('self','other'));
 end if;
end $$;
alter table public.seat_bookings drop constraint if exists seat_bookings_mode_owner_id_key;
create unique index if not exists seat_one_self_per_owner_idx on public.seat_bookings(mode,owner_id) where booked_for='self';
create unique index if not exists live_student_unique_idx on public.seat_bookings(student_number) where mode='live';
create table if not exists public.student_roster (
 student_number text primary key check(student_number ~ '^[0-9]{1,3}$'),
 email text not null unique check(char_length(email) <=254),
 constraint email_lowercase check (email=lower(email))
);
create table if not exists public.classroom_admins (user_id uuid primary key references auth.users(id) on delete cascade);
create table if not exists public.state_signal (id integer primary key check(id=1),version bigint not null default 0,updated_at timestamptz not null default now());
insert into public.state_signal(id) values(1) on conflict do nothing;

-- All business data is inaccessible via REST tables; only the RPCs below may operate on it.
revoke all on public.classroom_control,public.seat_catalog,public.seat_holds,public.seat_bookings,public.student_roster,public.classroom_admins,public.state_signal from public,anon,authenticated;
alter table public.classroom_control enable row level security;
alter table public.seat_catalog enable row level security;
alter table public.seat_holds enable row level security;
alter table public.seat_bookings enable row level security;
alter table public.student_roster enable row level security;
alter table public.classroom_admins enable row level security;
alter table public.state_signal enable row level security;
-- Read-only realtime signal contains NO bookings or personal information.
grant select on public.state_signal to anon,authenticated;
drop policy if exists state_signal_read on public.state_signal;
create policy state_signal_read on public.state_signal for select to anon,authenticated using (true);

create or replace function public.bump_classroom_signal() returns void
language plpgsql security definer set search_path = '' as $$
begin update public.state_signal set version=version+1,updated_at=clock_timestamp() where id=1; end $$;

create or replace function public.is_classroom_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists (
  select 1 from public.classroom_admins a join auth.users u on u.id=a.user_id
  where a.user_id=auth.uid() and not u.is_anonymous and u.email_confirmed_at is not null
 );
$$;

-- Snapshot reveals only status and ownership of the current viewer's hold / booking.
create or replace function public.public_snapshot() returns jsonb
language sql stable security definer set search_path = '' as $$
with cfg as (select mode,case when mode='test' then test_opens_at else live_opens_at end as opens_at from public.classroom_control where id=1)
select jsonb_build_object(
 'mode',(select mode from cfg),
 'opens_at',(select opens_at from cfg),
 'server_now',clock_timestamp(),
 'catalog',coalesce((select jsonb_agg(jsonb_build_object('seat_id',seat_id,'enabled',enabled) order by seat_id) from public.seat_catalog),'[]'::jsonb),
 'booked',coalesce((select jsonb_agg(b.seat_id order by b.seat_id) from public.seat_bookings b where b.mode=(select mode from cfg)),'[]'::jsonb),
 'holds',coalesce((select jsonb_agg(jsonb_build_object('seat_id',h.seat_id,'expires_at',h.expires_at,'mine',h.owner_id=auth.uid()) order by h.seat_id) from public.seat_holds h where h.mode=(select mode from cfg) and h.expires_at>clock_timestamp()),'[]'::jsonb),
 'mine_bookings',coalesce((select jsonb_agg(jsonb_build_object('seat_id',b.seat_id,'student_name',b.student_name,'student_number',b.student_number,'booked_for',b.booked_for,'booked_at',b.booked_at) order by b.booked_at desc) from public.seat_bookings b where b.mode=(select mode from cfg) and b.owner_id=auth.uid()),'[]'::jsonb)
);
$$;

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

create or replace function public.drop_hold(p_seat text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_mode text;
begin
 if auth.uid() is null then return jsonb_build_object('ok',false);end if;
 perform pg_advisory_xact_lock(4242427001);
 select mode into v_mode from public.classroom_control where id=1;
 delete from public.seat_holds where mode=v_mode and seat_id=p_seat and owner_id=auth.uid();
 if found then perform public.bump_classroom_signal();return jsonb_build_object('ok',true);end if;
 return jsonb_build_object('ok',false);
end $$;

-- Remove v7 RPC signature, so old clients cannot bypass the new proxy-booking checks.
drop function if exists public.confirm_seat(text,text,text);
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

create or replace function public.admin_snapshot() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_mode text; v_result jsonb;
begin
 if not public.is_classroom_admin() then raise exception 'permission denied: admin only' using errcode='42501';end if;
 select mode into v_mode from public.classroom_control where id=1;
 select public.public_snapshot() || jsonb_build_object(
 'reservations',coalesce((select jsonb_agg(jsonb_build_object('seat_id',seat_id,'student_name',student_name,'student_number',student_number,'booked_at',booked_at) order by seat_id) from public.seat_bookings where mode=v_mode),'[]'::jsonb),
 'roster',coalesce((select jsonb_agg(jsonb_build_object('student_number',student_number,'email',email) order by student_number) from public.student_roster),'[]'::jsonb)
 ) into v_result;
 return v_result;
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
create or replace function public.admin_set_opening(p_mode text,p_opens_at timestamptz) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_classroom_admin() then raise exception 'admin only' using errcode='42501';end if;
 if p_mode not in ('test','live') or p_opens_at is null or p_opens_at<'2024-01-01'::timestamptz or p_opens_at>'2100-01-01'::timestamptz then return false;end if;
 perform pg_advisory_xact_lock(4242427001);
 if p_mode='test' then update public.classroom_control set test_opens_at=p_opens_at where id=1;
 else update public.classroom_control set live_opens_at=p_opens_at where id=1;end if;
 delete from public.seat_holds where mode=p_mode;
 perform public.bump_classroom_signal();return true;
end $$;
create or replace function public.admin_reset_test() returns boolean
language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_classroom_admin() then raise exception 'admin only' using errcode='42501';end if;
 perform pg_advisory_xact_lock(4242427001);
 delete from public.seat_holds where mode='test';
 delete from public.seat_bookings where mode='test';
 perform public.bump_classroom_signal();return true;
end $$;
create or replace function public.admin_set_enabled(p_seat text,p_enabled boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_classroom_admin() then raise exception 'admin only' using errcode='42501';end if;
 if p_enabled is null then return false;end if;
 perform pg_advisory_xact_lock(4242427001);
 if not p_enabled and (exists(select 1 from public.seat_bookings where seat_id=p_seat) or exists(select 1 from public.seat_holds where seat_id=p_seat and expires_at>clock_timestamp())) then return false;end if;
 update public.seat_catalog set enabled=p_enabled where seat_id=p_seat;
 if not found then return false;end if;
 perform public.bump_classroom_signal();return true;
end $$;
create or replace function public.admin_modify_reservation(p_seat text,p_action text,p_name text default '',p_number text default '') returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_mode text;v_owner uuid;v_no text:=btrim(coalesce(p_number,''));v_name text:=btrim(coalesce(p_name,''));
begin
 if not public.is_classroom_admin() then raise exception 'admin only' using errcode='42501';end if;
 perform pg_advisory_xact_lock(4242427001);
 select mode into v_mode from public.classroom_control where id=1;
 if p_action='clear' then
   delete from public.seat_bookings where mode=v_mode and seat_id=p_seat;
   delete from public.seat_holds where mode=v_mode and seat_id=p_seat;
 elsif p_action='update' then
   if char_length(v_name) not between 1 and 80 or (v_no<>'' and v_no !~ '^[0-9]{1,3}$') then return false;end if;
   select owner_id into v_owner from public.seat_bookings where mode=v_mode and seat_id=p_seat;
   if v_owner is null then return false;end if;
   if v_mode='live' and not exists(select 1 from public.student_roster r where r.student_number=v_no) then return false;end if;
   update public.seat_bookings set student_name=v_name,student_number=v_no where mode=v_mode and seat_id=p_seat;
 else return false;end if;
 perform public.bump_classroom_signal();return true;
end $$;
create or replace function public.admin_upsert_roster(p_number text,p_email text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_email text:=lower(btrim(coalesce(p_email,'')));
begin
 if not public.is_classroom_admin() then raise exception 'admin only' using errcode='42501';end if;
 if p_number !~ '^[0-9]{1,3}$' or char_length(v_email)>254 or v_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then return false;end if;
 perform pg_advisory_xact_lock(4242427001);
 -- If the email was assigned to another number, reassign it safely.
 delete from public.student_roster where email=v_email and student_number<>p_number;
 insert into public.student_roster(student_number,email) values(p_number,v_email)
 on conflict(student_number) do update set email=excluded.email;
 perform public.bump_classroom_signal();return true;
end $$;
create or replace function public.admin_remove_roster(p_number text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_classroom_admin() then raise exception 'admin only' using errcode='42501';end if;
 delete from public.student_roster where student_number=p_number;
 perform public.bump_classroom_signal();return true;
end $$;

-- PostgreSQL functions are EXECUTE by PUBLIC by default; explicitly set the RPC allowlist.
revoke all on function public.bump_classroom_signal() from public,anon,authenticated;
revoke all on function public.is_classroom_admin() from public,anon,authenticated;
revoke all on function public.public_snapshot() from public,anon,authenticated;
revoke all on function public.hold_seat(text) from public,anon,authenticated;
revoke all on function public.drop_hold(text) from public,anon,authenticated;
revoke all on function public.confirm_seat(text,text,text,boolean) from public,anon,authenticated;
revoke all on function public.admin_snapshot() from public,anon,authenticated;
revoke all on function public.admin_set_mode(text) from public,anon,authenticated;
revoke all on function public.admin_set_opening(text,timestamptz) from public,anon,authenticated;
revoke all on function public.admin_reset_test() from public,anon,authenticated;
revoke all on function public.admin_set_enabled(text,boolean) from public,anon,authenticated;
revoke all on function public.admin_modify_reservation(text,text,text,text) from public,anon,authenticated;
revoke all on function public.admin_upsert_roster(text,text) from public,anon,authenticated;
revoke all on function public.admin_remove_roster(text) from public,anon,authenticated;
grant execute on function public.public_snapshot() to anon,authenticated;
grant execute on function public.hold_seat(text),public.drop_hold(text),public.confirm_seat(text,text,text,boolean) to authenticated;
grant execute on function public.admin_snapshot(),public.admin_set_mode(text),public.admin_set_opening(text,timestamptz),public.admin_reset_test(),public.admin_set_enabled(text,boolean),public.admin_modify_reservation(text,text,text,text),public.admin_upsert_roster(text,text),public.admin_remove_roster(text) to authenticated;

-- Supabase Realtime. Falling back to polling every 2.5s works if Realtime is not enabled.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists (
  select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='state_signal'
 ) then
  alter publication supabase_realtime add table public.state_signal;
 end if;
end $$;

-- FINAL SETUP (run separately after you create your admin's verified Supabase Auth user):
-- INSERT INTO public.classroom_admins(user_id)
-- SELECT id FROM auth.users WHERE lower(email)='admin@example.com' AND is_anonymous=false
-- ON CONFLICT DO NOTHING;
-- NEVER put your admin password, user UID, or Supabase service_role key in public website files.
