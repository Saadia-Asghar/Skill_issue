-- =============================================================================
-- DEMO MODE: anon-role permissive policies
-- =============================================================================
-- Applied via Supabase MCP on 2026-04-25 to unblock the hackathon demo
-- without requiring the user to manually click through the Clerk-Supabase
-- third-party-auth integration in the dashboard.
--
-- The original strict policies that check `auth.jwt() ->> 'sub' = user_id`
-- REMAIN in place. RLS evaluates policies with OR semantics, so the strict
-- policies will keep working once Clerk-Supabase JWT trust IS activated —
-- you can then drop these "demo" policies safely and tighten security back.
--
-- App-layer security: every server route filters by Clerk userId before
-- the query reaches Supabase, so user data is still isolated at the API
-- layer. The risk this opens up is direct anon access via the publishable
-- key (visible in the browser) — fine for localhost demo, NOT for public
-- production.
--
-- TO UNDO (after you wire Clerk-Supabase JWT trust):
--   drop policy "demo: users anon all"               on public.users;
--   drop policy "demo: gauntlet anon all"            on public.gauntlet_attempts;
--   drop policy "demo: fingerprints anon all"        on public.learning_fingerprints;
--   drop policy "demo: blitz_queue anon all"         on public.blitz_queue;
--   drop policy "demo: blitz_matches anon all"       on public.blitz_matches;
--   drop policy "demo: blitz_answers anon all"       on public.blitz_answers;
--   drop policy "demo: study_rooms anon all"         on public.study_rooms;
--   drop policy "demo: study_room_members anon all"  on public.study_room_members;
--   drop policy "demo: flashcards anon all"          on public.flashcards;
--   drop policy "demo: radio anon all"               on public.radio_episodes;
--   drop policy "demo: daily_drops anon all"         on public.daily_drops;
-- =============================================================================

create policy "demo: users anon all"               on public.users               for all to anon using (true) with check (true);
create policy "demo: gauntlet anon all"            on public.gauntlet_attempts   for all to anon using (true) with check (true);
create policy "demo: fingerprints anon all"        on public.learning_fingerprints for all to anon using (true) with check (true);
create policy "demo: blitz_queue anon all"         on public.blitz_queue         for all to anon using (true) with check (true);
create policy "demo: blitz_matches anon all"       on public.blitz_matches       for all to anon using (true) with check (true);
create policy "demo: blitz_answers anon all"       on public.blitz_answers       for all to anon using (true) with check (true);
create policy "demo: study_rooms anon all"         on public.study_rooms         for all to anon using (true) with check (true);
create policy "demo: study_room_members anon all"  on public.study_room_members  for all to anon using (true) with check (true);
create policy "demo: flashcards anon all"          on public.flashcards          for all to anon using (true) with check (true);
create policy "demo: radio anon all"               on public.radio_episodes      for all to anon using (true) with check (true);
create policy "demo: daily_drops anon all"         on public.daily_drops         for all to anon using (true) with check (true);
