-- Demo-mode storage policies for the `radio` bucket.
--
-- Mirrors the table-level demo policies in `demo_mode_anon_permissive_policies`.
-- The existing strict policies (`radio owner upload/update/delete`) require
-- auth.jwt() ->> 'sub' to match the folder name, which is impossible while
-- CLERK_SUPABASE_JWT_TRUSTED=0 because we send no JWT. These extra policies
-- grant the anon role full CRUD on the radio bucket so server-side uploads
-- (initiated from /api/radio after Clerk auth) succeed.
--
-- DROP THESE once Clerk-Supabase third-party JWT trust is wired up; the
-- strict per-user owner policies will then take over.

create policy "demo: radio anon insert"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'radio');

create policy "demo: radio anon update"
  on storage.objects for update
  to anon
  using (bucket_id = 'radio')
  with check (bucket_id = 'radio');

create policy "demo: radio anon delete"
  on storage.objects for delete
  to anon
  using (bucket_id = 'radio');

create policy "demo: radio anon select"
  on storage.objects for select
  to anon
  using (bucket_id = 'radio');
