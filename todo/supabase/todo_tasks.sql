-- ClassVerse M.4/11 · Option 03 To-Do List
-- Run in the seating Supabase project (uazwviifldjdqthizkem).
-- Admin membership is checked by the existing hardened seatmap_is_admin() function.
-- Group access is tied to a verified Supabase Auth user via class_task_student_accounts.

create table if not exists public.class_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 180),
  details text not null default '' check (char_length(details) <= 5000),
  task_type text not null default 'homework'
    check (task_type in ('announcement','activity','homework')),
  subject text not null default '' check (char_length(subject) <= 100),
  due_date date,
  audience text not null default 'public',
  assigned_email text,
  assigned_group_id uuid,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.class_task_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Maps an existing, verified Auth account to a classroom number.
-- Populate this table after students have their Supabase Auth accounts.
create table if not exists public.class_task_student_accounts (
  student_number text primary key check (student_number ~ '^[0-9]{1,3}$'),
  email text not null unique check (email = lower(email) and char_length(email) <= 254),
  user_id uuid not null unique references auth.users(id) on delete cascade
);

create table if not exists public.class_task_group_members (
  group_id uuid not null references public.class_task_groups(id) on delete cascade,
  student_number text not null references public.class_task_student_accounts(student_number) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, student_number)
);

alter table public.class_tasks
  add column if not exists assigned_group_id uuid;

alter table public.class_tasks
  drop constraint if exists class_tasks_audience_check,
  drop constraint if exists class_tasks_private_email_check,
  drop constraint if exists class_tasks_audience_assignment_check;

alter table public.class_tasks
  add constraint class_tasks_audience_assignment_check check (
    (audience = 'public' and assigned_email is null and assigned_group_id is null) or
    (audience = 'private' and assigned_email is not null and assigned_group_id is null
      and char_length(btrim(assigned_email)) between 1 and 254) or
    (audience = 'group' and assigned_email is null and assigned_group_id is not null)
  );

alter table public.class_tasks
  drop constraint if exists class_tasks_assigned_group_id_fkey;
alter table public.class_tasks
  add constraint class_tasks_assigned_group_id_fkey
  foreign key (assigned_group_id) references public.class_task_groups(id) on delete restrict;

create index if not exists class_tasks_due_date_idx on public.class_tasks(due_date);
create index if not exists class_tasks_audience_email_idx on public.class_tasks(audience,lower(assigned_email));
create index if not exists class_tasks_group_idx on public.class_tasks(assigned_group_id);
create index if not exists class_task_accounts_user_idx on public.class_task_student_accounts(user_id);

alter table public.class_tasks enable row level security;
alter table public.class_task_groups enable row level security;
alter table public.class_task_student_accounts enable row level security;
alter table public.class_task_group_members enable row level security;

revoke all on public.class_tasks, public.class_task_groups,
  public.class_task_student_accounts, public.class_task_group_members
  from public, anon, authenticated;
grant select on public.class_tasks to anon, authenticated;
grant insert, update, delete on public.class_tasks to authenticated;
grant select, insert, update, delete on public.class_task_groups,
  public.class_task_student_accounts, public.class_task_group_members to authenticated;

create or replace function public.class_task_is_group_member(p_group_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.class_task_group_members gm
    join public.class_task_student_accounts sa
      on sa.student_number = gm.student_number
    where gm.group_id = p_group_id
      and sa.user_id = auth.uid()
  );
$$;

revoke all on function public.class_task_is_group_member(uuid) from public, anon;
grant execute on function public.class_task_is_group_member(uuid) to authenticated;

drop policy if exists "class tasks visible public or assigned" on public.class_tasks;
drop policy if exists "class tasks admin insert" on public.class_tasks;
drop policy if exists "class tasks admin update" on public.class_tasks;
drop policy if exists "class tasks admin delete" on public.class_tasks;

create policy "class tasks visible public or assigned" on public.class_tasks
for select to anon, authenticated using (
  audience = 'public'
  or (audience = 'private' and auth.uid() is not null
      and lower(assigned_email) = lower(coalesce(auth.jwt()->>'email','')))
  or (audience = 'group' and auth.uid() is not null
      and public.class_task_is_group_member(assigned_group_id))
  or public.seatmap_is_admin()
);

create policy "class tasks admin insert" on public.class_tasks
for insert to authenticated with check (public.seatmap_is_admin());
create policy "class tasks admin update" on public.class_tasks
for update to authenticated using (public.seatmap_is_admin())
with check (public.seatmap_is_admin());
create policy "class tasks admin delete" on public.class_tasks
for delete to authenticated using (public.seatmap_is_admin());

drop policy if exists "task groups admin only" on public.class_task_groups;
create policy "task groups admin only" on public.class_task_groups
for all to authenticated using (public.seatmap_is_admin())
with check (public.seatmap_is_admin());

drop policy if exists "task student accounts admin only" on public.class_task_student_accounts;
create policy "task student accounts admin only" on public.class_task_student_accounts
for all to authenticated using (public.seatmap_is_admin())
with check (public.seatmap_is_admin());

drop policy if exists "task group members admin only" on public.class_task_group_members;
create policy "task group members admin only" on public.class_task_group_members
for all to authenticated using (public.seatmap_is_admin())
with check (public.seatmap_is_admin());

-- After creating each student's verified Supabase Auth account, map it to their class number.
-- Run as a project owner in SQL Editor; replace the example values:
-- insert into public.class_task_student_accounts(student_number,email,user_id)
-- select '01', lower(email), id from auth.users
-- where lower(email)='student01@example.com'
--   and is_anonymous=false and email_confirmed_at is not null
-- on conflict (student_number) do update
-- set email=excluded.email,user_id=excluded.user_id;
