# ClassVerse Option 03 — To-Do List (ลงมือทำ)

Standalone module at `/todo/`, opened from the third card in the classroom menu.

## Features
- Classroom-wide announcements, activities and homework.
- Search and category filters, Thai date display and responsive layout.
- Admin-only create/edit/delete, verified through the existing Class Room Map admin RPC.
- Public tasks are visible to all visitors.
- Private tasks are visible only to the assigned authenticated email and Admin; Postgres RLS enforces this.
- Uses the Class Room Map Supabase project/config, without changing the seat booking project or its records.

## Database
Run `todo/supabase/todo_tasks.sql` in Supabase SQL Editor for project `uazwviifldjdqthizkem` (Class Room Map). This SQL creates only `public.class_tasks` and its policies. It reuses the already-installed `public.seatmap_is_admin()` role check.

## Account expectations
Admin and students sign in using existing Supabase Auth accounts. For a private task, Admin enters the recipient's exact Auth email address. A student who has not yet been given a Supabase Auth account cannot view a private task until that account exists and its email matches the assignment. Student signup is intentionally not exposed on this page.

## Safety
- Do not place a Supabase service-role/secret key in client config.
- Private-task visibility is enforced by row-level security, not only client-side filters.
- No schema or data changes are made to the seat booking project.
