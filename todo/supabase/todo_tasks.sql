-- ClassVerse M.4/11 · Option 03 To-Do List
-- Run in the Supabase SQL Editor for project uazwviifldjdqthizkem.
-- Admin membership is checked by the hardened seatmap_is_admin() function
-- already used by Class Room Map; private records are filtered by Auth email.

create table if not exists public.class_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 180),
  details text not null default '' check (char_length(details) <= 5000),
  task_type text not null default 'homework'
    check (task_type in ('announcement','activity','homework')),
  subject text not null default '' check (char_length(subject) <= 100),
  due_date date,
  audience text not null default 'public' check (audience in ('public','private')),
  assigned_email text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_tasks_private_email_check check (
    (audience='public' and assigned_email is null) or
    (audience='private' and assigned_email is not null and char_length(btrim(assigned_email)) <= 254)
  )
);
create index if not exists class_tasks_due_date_idx on public.class_tasks(due_date);
create index if not exists class_tasks_audience_email_idx on public.class_tasks(audience,lower(assigned_email));
alter table public.class_tasks enable row level security;
grant select on public.class_tasks to anon, authenticated;
grant insert,update,delete on public.class_tasks to authenticated;

drop policy if exists "class tasks visible public or assigned" on public.class_tasks;
create policy "class tasks visible public or assigned" on public.class_tasks
for select to anon,authenticated using (
  audience='public'
  or (audience='private' and auth.uid() is not null and lower(assigned_email)=lower(coalesce(auth.jwt()->>'email','')))
  or public.seatmap_is_admin()
);
drop policy if exists "class tasks admin insert" on public.class_tasks;
create policy "class tasks admin insert" on public.class_tasks
for insert to authenticated with check (public.seatmap_is_admin());
drop policy if exists "class tasks admin update" on public.class_tasks;
create policy "class tasks admin update" on public.class_tasks
for update to authenticated using (public.seatmap_is_admin()) with check (public.seatmap_is_admin());
drop policy if exists "class tasks admin delete" on public.class_tasks;
create policy "class tasks admin delete" on public.class_tasks
for delete to authenticated using (public.seatmap_is_admin());
