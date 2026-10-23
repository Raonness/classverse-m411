-- ClassVerse M.4/11 — STEP 23, READ-ONLY swap request audit.
-- Run in the NEW seating Supabase project only.
-- SELECT queries do not alter student profiles, requests, or reservations.
-- Results are aggregated (no names, birthdays, or individual student records).
WITH audit AS (
 SELECT
   r.id,
   r.status,
   (src.seat_id IS NOT NULL
      AND src.student_name IS NOT DISTINCT FROM r.requester_name
      AND src.student_number IS NOT DISTINCT FROM r.requester_number
      AND dst.seat_id IS NOT NULL AND dst.student_name IS NOT NULL
      AND r.from_seat <> r.to_seat
   ) AS can_review_for_approval
 FROM public.seatmap_swap_requests r
 LEFT JOIN public.seatmap_seats src ON src.seat_id=r.from_seat
 LEFT JOIN public.seatmap_seats dst ON dst.seat_id=r.to_seat
)
SELECT
 count(*) FILTER (WHERE status='pending') AS pending_requests,
 count(*) FILTER (WHERE status='pending' AND can_review_for_approval) AS pending_matching_current_map,
 count(*) FILTER (WHERE status='pending' AND NOT can_review_for_approval) AS pending_needs_recheck,
 count(*) FILTER (WHERE status='approved') AS approved_requests,
 count(*) FILTER (WHERE status='rejected') AS rejected_requests
FROM audit;
