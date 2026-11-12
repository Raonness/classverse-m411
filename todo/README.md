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
Run `todo/supabase/todo_tasks.sql` in Supabase SQL Editor for project `uazwviifldjdqthizkem` (Class Room Map). It creates the task, group, group-membership and student-account mapping tables, with Row Level Security. It reuses the already-installed `public.seatmap_is_admin()` role check and the `public.seatmap_public_snapshot()` RPC.

For group tasks, first create each student's verified Supabase Auth account, then map their class number to that account in the SQL Editor using the example at the bottom of `todo/supabase/todo_tasks.sql`. Only mapped accounts can be selected as group members; students see group tasks only when their authenticated account is mapped to a member number. This account mapping is separate from the seat-booking project's roster.

## Account expectations
Admin and students sign in using existing Supabase Auth accounts. For a private task, Admin enters the recipient's exact Auth email address. A student who has not yet been given a Supabase Auth account cannot view a private task until that account exists and its email matches the assignment. Student signup is intentionally not exposed on this page.

## Safety
- Do not place a Supabase service-role/secret key in client config.
- Private-task visibility is enforced by row-level security, not only client-side filters.
- No schema or data changes are made to the seat booking project.
