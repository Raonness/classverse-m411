# ClassroomHub Seating Directory

This is a separate 40-seat directory using the exact seat IDs and map rendering geometry from the uploaded v10 project. It starts EMPTY, independently of previous reservations.

1. In Supabase SQL Editor, execute `supabase/seatmap.sql` (do not rerun the old reservation schema).
2. In Supabase Authentication > Users, create ONE admin account with email/password. Copy that user's UUID. Run `insert into public.seatmap_admins(user_id) values ('YOUR-UUID');` in SQL Editor. Do not use an admin password in frontend code.
3. Set `supabaseUrl` and `supabaseAnonKey` in `config.js` using the project's URL and publishable key. Never put a service_role/secret key in the frontend.
4. Deploy `index.html`, `styles.css`, `seatmap.css`, `seatmap.js`, `config.js` as static files, e.g. GitHub Pages or Netlify.
5. Admin logs in and enters students into seats. Visitors can view without signing in. Students can request a swap by name and number; requests remain pending until admin approves. Approval atomically swaps the two current occupants.

**Security and consent:** The name-and-number request form is not strong student identity verification. Anyone who knows a student's name and number could submit a request; the admin should independently verify consent of both students before approval. The SQL enforces admin-only modifications. Anonymous requests may require additional CAPTCHA/rate-limiting before broad public deployment. Avoid exposing student names to the public internet unless your school has permission to publish them.

**Note:** This replaces the booking interface while preserving the original stylesheet, seat map geometry, IDs and classroom presentation. It is not a pixel-for-pixel clone of the old booking form because the workflow changes.
