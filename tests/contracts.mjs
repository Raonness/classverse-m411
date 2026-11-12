import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const todo = readFileSync('todo/app.js', 'utf8');
const schema = readFileSync('todo/supabase/todo_tasks.sql', 'utf8');
const html = readFileSync('todo/index.html', 'utf8');

assert.match(todo, /class_task_student_accounts/);
assert.match(todo, /rpc\("seatmap_public_snapshot"\)/);
assert.doesNotMatch(todo, /from\("student_roster"\)|from\("seatmap_student_roster"\)/);
assert.match(todo, /row\.audience !== "private"/);
assert.match(schema, /create table if not exists public\.class_task_groups/i);
assert.match(schema, /create table if not exists public\.class_task_student_accounts/i);
assert.match(schema, /create table if not exists public\.class_task_group_members/i);
assert.match(schema, /assigned_group_id uuid/i);
assert.match(schema, /audience = 'group'/i);
assert.match(schema, /class_task_is_group_member\(assigned_group_id\)/i);
assert.match(schema, /task groups admin only/i);
assert.match(schema, /task student accounts admin only/i);
assert.match(schema, /task group members admin only/i);
assert.match(html, /id="groupMembers"/);
assert.match(html, /id="assignedGroup"/);

const booking = readFileSync('booking/app.js', 'utf8');
const bookingSchema = readFileSync('booking/supabase/schema.sql', 'utf8');
const bookingMigration = readFileSync('booking/supabase/upgrade-live-roster-name.sql', 'utf8');
const bookingHtml = readFileSync('booking/index.html', 'utf8');
assert.match(booking, /rosterName/);
assert.match(booking, /ไม่ต้องยืนยันอีเมล/);
assert.match(bookingSchema, /lower\(btrim\(r\.student_name\)\)=lower\(v_name\)/);
assert.match(bookingMigration, /student_name text not null default ''/);
assert.match(bookingMigration, /ชื่อและเลขที่ไม่ตรงกับรายชื่อนักเรียน/);
assert.match(bookingHtml, /id="rosterName"/);
assert.match(bookingHtml, /ไม่ต้องยืนยันอีเมล/);

console.log('To-Do and booking database/UI contracts passed.');
