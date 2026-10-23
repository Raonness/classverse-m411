-- ClassVerse M.4/11 — Step 25: secure private admin audit log.
-- Run ONLY in the NEW seating Supabase project (uazwviifldjdqthizkem).
-- Additive: does not delete or rewrite existing seat/profile/request data.
-- Run this AFTER the existing profile/safety SQL files.

begin;

create table if not exists public.seatmap_admin_audit (
  id bigint generated always as identity primary key,
  admin_user_id uuid not null,
  admin_email text,
  action text not null check (action in ('seat_assign','seat_clear','seat_move','profile_update','swap_approved','swap_rejected')),
  student_name text,
  student_number integer,
  from_seat text,
  to_seat text,
  changed_fields text[] not null default '{}',
  reason text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists seatmap_admin_audit_created_at_idx
  on public.seatmap_admin_audit (created_at desc, id desc);
create index if not exists seatmap_admin_audit_student_idx
  on public.seatmap_admin_audit (student_number, created_at desc, id desc);

alter table public.seatmap_admin_audit enable row level security;
revoke all on public.seatmap_admin_audit from public, anon, authenticated;

create schema if not exists private;

-- Internal writer. It is deliberately not executable by anon/authenticated directly.
create or replace function private.seatmap_write_audit(
  p_action text,
  p_student_name text default null,
  p_student_number integer default null,
  p_from_seat text default null,
  p_to_seat text default null,
  p_changed_fields text[] default '{}',
  p_reason text default '',
  p_details jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.seatmap_is_admin() then
    raise exception 'Admin only' using errcode='42501';
  end if;

  if p_action not in ('seat_assign','seat_clear','seat_move','profile_update','swap_approved','swap_rejected') then
    raise exception 'Invalid audit action';
  end if;

  insert into public.seatmap_admin_audit(
    admin_user_id, admin_email, action, student_name, student_number,
    from_seat, to_seat, changed_fields, reason, details
  ) values (
    auth.uid(),
    nullif(auth.jwt()->>'email',''),
    p_action,
    nullif(trim(coalesce(p_student_name,'')),''),
    p_student_number,
    p_from_seat,
    p_to_seat,
    coalesce(p_changed_fields,'{}'),
    left(coalesce(p_reason,''),500),
    coalesce(p_details,'{}'::jsonb)
  );
end$$;

revoke all on function private.seatmap_write_audit(text,text,integer,text,text,text[],text,jsonb) from public, anon, authenticated;

-- Replace the existing assignment RPC so every successful admin seat/profile change is logged.
drop function if exists public.seatmap_admin_assign_profile(text,text,integer,text,date);
drop function if exists public.seatmap_admin_assign_profile(text,text,integer,text,date,text);

create function public.seatmap_admin_assign_profile(
  p_seat text,
  p_name text,
  p_number integer,
  p_nickname text default null,
  p_birthday date default null,
  p_reason text default ''
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := nullif(trim(coalesce(p_name,'')), '');
  v_nick text := nullif(trim(coalesce(p_nickname,'')), '');
  v_old public.seatmap_seats%rowtype;
  v_dest public.seatmap_seats%rowtype;
  v_fields text[] := '{}';
  v_details jsonb := '{}'::jsonb;
begin
  if not public.seatmap_is_admin() then
    raise exception 'Admin only' using errcode='42501';
  end if;

  perform pg_advisory_xact_lock(55224411);

  select * into v_dest
  from public.seatmap_seats
  where seat_id=p_seat
  for update;
  if not found then raise exception 'Invalid seat'; end if;

  if v_name is null then
    if v_dest.student_number is not null then
      v_fields := array['name','student_number','nickname','birthday'];
      perform private.seatmap_write_audit(
        'seat_clear', v_dest.student_name, v_dest.student_number,
        p_seat, null, v_fields, p_reason,
        jsonb_build_object('before_seat',p_seat,'birthday_was_set',v_dest.birth_date is not null)
      );
    end if;
    update public.seatmap_seats
      set student_name=null, student_number=null, nickname=null, birth_date=null
      where seat_id=p_seat;
    return;
  end if;

  if char_length(v_name)>80 or p_number is null or p_number not between 1 and 99
     or char_length(coalesce(v_nick,''))>40 or char_length(coalesce(p_reason,''))>500 then
    raise exception 'Invalid student profile';
  end if;

  if v_dest.student_number is not null and v_dest.student_number<>p_number then
    raise exception 'This seat is occupied. Clear it deliberately, or approve a swap, before moving here';
  end if;

  select * into v_old
  from public.seatmap_seats
  where student_number=p_number and seat_id<>p_seat
  for update;

  if found then
    v_nick:=coalesce(v_nick,v_old.nickname);
    p_birthday:=coalesce(p_birthday,v_old.birth_date);
    update public.seatmap_seats
      set student_name=null,student_number=null,nickname=null,birth_date=null
      where seat_id=v_old.seat_id;

    update public.seatmap_seats
      set student_name=v_name,student_number=p_number,nickname=v_nick,birth_date=p_birthday
      where seat_id=p_seat;

    perform private.seatmap_write_audit(
      'seat_move', v_name, p_number, v_old.seat_id, p_seat,
      array['seat_id','name','student_number','nickname','birthday'], p_reason,
      jsonb_build_object('previous_name',v_old.student_name,'previous_seat',v_old.seat_id,'birthday_changed',v_old.birth_date is distinct from p_birthday)
    );
    return;
  end if;

  if v_dest.student_number is null then
    update public.seatmap_seats
      set student_name=v_name,student_number=p_number,nickname=v_nick,birth_date=p_birthday
      where seat_id=p_seat;

    perform private.seatmap_write_audit(
      'seat_assign', v_name, p_number, null, p_seat,
      array['seat_id','name','student_number','nickname','birthday'], p_reason,
      jsonb_build_object('birthday_set',p_birthday is not null)
    );
    return;
  end if;

  -- Same student remains in the same seat: treat as a profile edit.
  if v_dest.student_name is distinct from v_name then v_fields := array_append(v_fields,'name'); end if;
  if v_dest.student_number is distinct from p_number then v_fields := array_append(v_fields,'student_number'); end if;
  if v_dest.nickname is distinct from v_nick then v_fields := array_append(v_fields,'nickname'); end if;
  if v_dest.birth_date is distinct from p_birthday then v_fields := array_append(v_fields,'birthday'); end if;

  update public.seatmap_seats
    set student_name=v_name,student_number=p_number,nickname=v_nick,birth_date=p_birthday
    where seat_id=p_seat;

  if cardinality(v_fields)>0 then
    v_details := jsonb_build_object(
      'before_name',v_dest.student_name,
      'before_student_number',v_dest.student_number,
      'before_nickname',v_dest.nickname,
      'birthday_changed',v_dest.birth_date is distinct from p_birthday,
      'birthday_was_set',v_dest.birth_date is not null,
      'birthday_is_set',p_birthday is not null
    );
    perform private.seatmap_write_audit(
      'profile_update', v_name, p_number, p_seat, p_seat,
      v_fields, p_reason, v_details
    );
  end if;
end$$;

revoke all on function public.seatmap_admin_assign_profile(text,text,integer,text,date,text) from public, anon, authenticated;
grant execute on function public.seatmap_admin_assign_profile(text,text,integer,text,date,text) to authenticated;

-- Replace swap decision so approvals/rejections are also logged atomically.
create or replace function public.seatmap_admin_decide(p_id uuid,p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  req public.seatmap_swap_requests%rowtype;
  a public.seatmap_seats%rowtype;
  b public.seatmap_seats%rowtype;
  v_action text;
begin
  if not public.seatmap_is_admin() then raise exception 'Admin only'; end if;

  select * into req
  from public.seatmap_swap_requests
  where id=p_id and status='pending'
  for update;
  if not found then raise exception 'Request already processed'; end if;

  if p_approve then
    perform 1 from public.seatmap_seats
      where seat_id in (req.from_seat,req.to_seat)
      order by seat_id for update;
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

    v_action := 'swap_approved';
  else
    v_action := 'swap_rejected';
  end if;

  update public.seatmap_swap_requests
    set status=case when p_approve then 'approved' else 'rejected' end,
        decided_at=now()
    where id=p_id;

  perform private.seatmap_write_audit(
    v_action,
    req.requester_name,
    req.requester_number,
    req.from_seat,
    req.to_seat,
    case when p_approve then array['seat_id','student_assignment','nickname','birthday'] else array[]::text[] end,
    req.reason,
    jsonb_build_object(
      'request_id',req.id,
      'requester_name',req.requester_name,
      'requester_number',req.requester_number,
      'from_seat',req.from_seat,
      'to_seat',req.to_seat,
      'destination_student_name',case when p_approve then b.student_name else null end,
      'destination_student_number',case when p_approve then b.student_number else null end
    )
  );
end$$;

revoke all on function public.seatmap_admin_decide(uuid,boolean) from public,anon,authenticated;
grant execute on function public.seatmap_admin_decide(uuid,boolean) to authenticated;

-- Read-only admin viewer. No direct table access is granted.
create or replace function public.seatmap_admin_audit(p_limit integer default 50)
returns table(
  id bigint,
  admin_email text,
  action text,
  student_name text,
  student_number integer,
  from_seat text,
  to_seat text,
  changed_fields text[],
  reason text,
  details jsonb,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.seatmap_is_admin() then raise exception 'Admin only'; end if;
  return query
    select a.id,a.admin_email,a.action,a.student_name,a.student_number,
           a.from_seat,a.to_seat,a.changed_fields,a.reason,a.details,a.created_at
    from public.seatmap_admin_audit a
    order by a.created_at desc,a.id desc
    limit greatest(1,least(coalesce(p_limit,50),200));
end$$;

revoke all on function public.seatmap_admin_audit(integer) from public,anon,authenticated;
grant execute on function public.seatmap_admin_audit(integer) to authenticated;

commit;
