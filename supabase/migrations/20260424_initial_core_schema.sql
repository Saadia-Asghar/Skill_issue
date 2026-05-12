-- Baseline schema for an empty project. Later migrations (20260425+, gladiator,
-- chat, roast, storage) assume these tables and RPCs already exist.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'blitz_state') then
    create type public.blitz_state as enum ('WAITING', 'STUDY', 'BLITZ', 'FINISHED', 'ABANDONED');
  end if;
  if not exists (select 1 from pg_type where typname = 'flashcard_source') then
    create type public.flashcard_source as enum ('colosseum', 'gauntlet', 'study_room', 'blitz');
  end if;
  if not exists (select 1 from pg_type where typname = 'radio_status') then
    create type public.radio_status as enum ('pending', 'scripting', 'voicing', 'ready', 'failed');
  end if;
  if not exists (select 1 from pg_type where typname = 'rank_tier') then
    create type public.rank_tier as enum (
      'Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', 'PhD', 'Dean'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'study_room_state') then
    create type public.study_room_state as enum ('LOBBY', 'STUDY', 'QUIZ', 'FINISHED');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Helper: rank from XP (mirrors lib/rank.ts)
-- ---------------------------------------------------------------------------
create or replace function public.rank_for_xp(p_xp integer)
returns public.rank_tier
language sql
immutable
as $$
  select case
    when p_xp >= 30000 then 'Dean'::public.rank_tier
    when p_xp >= 15000 then 'PhD'::public.rank_tier
    when p_xp >= 7500 then 'Graduate'::public.rank_tier
    when p_xp >= 3500 then 'Senior'::public.rank_tier
    when p_xp >= 1500 then 'Junior'::public.rank_tier
    when p_xp >= 500 then 'Sophomore'::public.rank_tier
    else 'Freshman'::public.rank_tier
  end;
$$;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  clerk_id text primary key,
  username text,
  email text,
  avatar_url text,
  xp integer not null default 0 check (xp >= 0),
  elo integer not null default 1000,
  rank public.rank_tier not null default 'Freshman',
  current_streak integer not null default 0 check (current_streak >= 0),
  last_streak_date date,
  last_active timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  icon text,
  created_at timestamptz not null default now()
);

create table if not exists public.personas (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  tagline text,
  accent_color text,
  system_prompt text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.concepts (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references public.subjects(id) on delete set null,
  title text not null,
  text text not null,
  difficulty integer not null default 1 check (difficulty between 1 and 5),
  created_at timestamptz not null default now()
);

create table if not exists public.daily_drops (
  drop_date date primary key,
  concept_id uuid not null references public.concepts(id) on delete restrict,
  questions jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.study_rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  host_id text not null references public.users(clerk_id) on delete cascade,
  title text not null,
  source_text text,
  state public.study_room_state not null default 'LOBBY',
  study_seconds integer not null default 180 check (study_seconds > 0),
  pass_threshold integer not null default 2 check (pass_threshold >= 0),
  questions jsonb,
  study_started_at timestamptz,
  quiz_started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.study_room_members (
  room_id uuid not null references public.study_rooms(id) on delete cascade,
  user_id text not null references public.users(clerk_id) on delete cascade,
  joined_at timestamptz not null default now(),
  persona_slug text,
  display_name text,
  current_q integer not null default 0 check (current_q >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  finished_at timestamptz,
  finish_position integer,
  primary key (room_id, user_id)
);

create table if not exists public.blitz_queue (
  user_id text primary key references public.users(clerk_id) on delete cascade,
  persona_slug text not null,
  joined_at timestamptz not null default now()
);

create table if not exists public.blitz_matches (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references public.concepts(id) on delete restrict,
  player_a text not null references public.users(clerk_id) on delete cascade,
  player_b text references public.users(clerk_id) on delete cascade,
  persona_a text not null,
  persona_b text,
  questions jsonb not null,
  state public.blitz_state not null default 'WAITING',
  current_q integer not null default 0 check (current_q >= 0),
  player_a_correct integer not null default 0 check (player_a_correct >= 0),
  player_b_correct integer not null default 0 check (player_b_correct >= 0),
  winner text references public.users(clerk_id) on delete set null,
  study_started_at timestamptz,
  blitz_started_at timestamptz,
  q_started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  player_a_elo_before integer,
  player_a_elo_after integer,
  player_b_elo_before integer,
  player_b_elo_after integer
);

create table if not exists public.blitz_answers (
  match_id uuid not null references public.blitz_matches(id) on delete cascade,
  user_id text not null references public.users(clerk_id) on delete cascade,
  question_index integer not null check (question_index >= 0),
  choice integer not null,
  is_correct boolean not null,
  answered_at timestamptz not null default now(),
  primary key (match_id, user_id, question_index)
);

create table if not exists public.gauntlet_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(clerk_id) on delete cascade,
  concept_id uuid not null references public.concepts(id) on delete restrict,
  drop_date date,
  persona_slug text not null,
  correct_count integer not null check (correct_count >= 0),
  total_count integer not null check (total_count > 0),
  elapsed_seconds integer not null check (elapsed_seconds >= 0),
  performance numeric not null,
  is_ranked boolean not null default false,
  elo_before integer not null,
  elo_after integer not null,
  elo_delta integer not null,
  xp_awarded integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists gauntlet_one_ranked_per_drop
  on public.gauntlet_attempts (user_id, drop_date)
  where is_ranked is true and drop_date is not null;

create table if not exists public.learning_fingerprints (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(clerk_id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  persona_id uuid not null references public.personas(id) on delete cascade,
  weight numeric not null default 0,
  updates_count integer not null default 0 check (updates_count >= 0),
  created_at timestamptz not null default now(),
  last_updated timestamptz not null default now()
);

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(clerk_id) on delete cascade,
  concept_id uuid references public.concepts(id) on delete set null,
  persona_slug text not null,
  front text not null,
  back text not null,
  source public.flashcard_source not null,
  box integer not null default 1 check (box >= 1),
  correct_count integer not null default 0 check (correct_count >= 0),
  reviewed_count integer not null default 0 check (reviewed_count >= 0),
  next_review_at timestamptz not null,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.radio_episodes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(clerk_id) on delete cascade,
  title text not null,
  source_text text not null,
  script jsonb,
  status public.radio_status not null default 'pending',
  audio_url text,
  word_count integer,
  duration_seconds integer,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Blitz RPCs
-- ---------------------------------------------------------------------------
create or replace function public.dequeue_blitz_partner(
  p_user_id text,
  p_persona_slug text,
  p_concept_id uuid,
  p_questions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner text;
  v_match_id uuid;
begin
  select q.user_id
  into v_partner
  from public.blitz_queue q
  where q.user_id <> p_user_id
    and q.persona_slug = p_persona_slug
  order by q.joined_at asc
  for update skip locked
  limit 1;

  if v_partner is not null then
    delete from public.blitz_queue where user_id = v_partner;

    insert into public.blitz_matches (
      player_a,
      player_b,
      persona_a,
      persona_b,
      concept_id,
      questions,
      state,
      current_q,
      player_a_correct,
      player_b_correct,
      study_started_at
    )
    values (
      v_partner,
      p_user_id,
      p_persona_slug,
      p_persona_slug,
      p_concept_id,
      p_questions,
      'STUDY',
      0,
      0,
      0,
      now()
    )
    returning id into v_match_id;

    return v_match_id;
  end if;

  insert into public.blitz_queue (user_id, persona_slug)
  values (p_user_id, p_persona_slug)
  on conflict (user_id) do update
    set persona_slug = excluded.persona_slug,
        joined_at = now();

  return null;
end;
$$;

create or replace function public.start_blitz_phase(p_match_id uuid)
returns public.blitz_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.blitz_matches;
begin
  update public.blitz_matches m
  set
    state = 'BLITZ',
    blitz_started_at = coalesce(m.blitz_started_at, now()),
    q_started_at = now()
  where m.id = p_match_id
    and m.state = 'STUDY'
  returning * into v;

  if found then
    return v;
  end if;

  select * into v from public.blitz_matches where id = p_match_id;
  if not found then
    raise exception 'blitz match not found';
  end if;
  return v;
end;
$$;

create or replace function public.record_blitz_answer(
  p_match_id uuid,
  p_user_id text,
  p_question_index integer,
  p_choice integer
)
returns public.blitz_answers
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.blitz_matches;
  v_correct_idx integer;
  v_correct boolean;
  v_row public.blitz_answers;
begin
  select * into m from public.blitz_matches where id = p_match_id for update;
  if not found then
    raise exception 'blitz match not found';
  end if;
  if m.state <> 'BLITZ' then
    raise exception 'match is not in BLITZ phase';
  end if;
  if p_question_index <> m.current_q then
    raise exception 'stale question index';
  end if;
  if p_user_id not in (m.player_a, m.player_b) then
    raise exception 'not a participant';
  end if;

  v_correct_idx := coalesce((m.questions -> p_question_index ->> 'correct_index')::integer, -1);
  v_correct := p_choice = v_correct_idx;

  insert into public.blitz_answers (
    match_id, user_id, question_index, choice, is_correct, answered_at
  )
  values (p_match_id, p_user_id, p_question_index, p_choice, v_correct, now())
  on conflict (match_id, user_id, question_index) do update
    set choice = excluded.choice,
        is_correct = excluded.is_correct,
        answered_at = excluded.answered_at
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.advance_blitz_question(
  p_match_id uuid,
  p_force boolean default false
)
returns public.blitz_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.blitz_matches;
  v_deadline timestamptz;
  v_len integer;
  v_ci integer;
  a_ok boolean;
  b_ok boolean;
  a_corr boolean;
  b_corr boolean;
  v_now timestamptz := clock_timestamp();
  v_a_choice integer;
  v_b_choice integer;
  v_k numeric := 24;
  v_expected numeric;
  v_delta_a integer;
  elo_a integer;
  elo_b integer;
begin
  select * into m from public.blitz_matches where id = p_match_id for update;
  if not found then
    raise exception 'blitz match not found';
  end if;

  if m.state = 'FINISHED' or m.state = 'ABANDONED' then
    return m;
  end if;
  if m.state <> 'BLITZ' then
    return m;
  end if;

  v_len := coalesce(jsonb_array_length(m.questions), 0);
  if v_len <= 0 then
    raise exception 'match has no questions';
  end if;

  v_deadline := m.q_started_at + interval '12 seconds';

  select ba.is_correct into a_ok
  from public.blitz_answers ba
  where ba.match_id = p_match_id and ba.question_index = m.current_q and ba.user_id = m.player_a;

  select ba.is_correct into b_ok
  from public.blitz_answers ba
  where ba.match_id = p_match_id and ba.question_index = m.current_q and ba.user_id = m.player_b;

  if not (p_force or v_now >= v_deadline or (a_ok is not null and b_ok is not null)) then
    return m;
  end if;

  v_ci := coalesce((m.questions -> m.current_q ->> 'correct_index')::integer, -1);

  if a_ok is null then
    insert into public.blitz_answers (match_id, user_id, question_index, choice, is_correct, answered_at)
    values (p_match_id, m.player_a, m.current_q, -1, false, v_now)
    on conflict (match_id, user_id, question_index) do nothing;
    a_corr := false;
  else
    a_corr := a_ok;
  end if;

  if m.player_b is not null then
    if b_ok is null then
      insert into public.blitz_answers (match_id, user_id, question_index, choice, is_correct, answered_at)
      values (p_match_id, m.player_b, m.current_q, -1, false, v_now)
      on conflict (match_id, user_id, question_index) do nothing;
      b_corr := false;
    else
      b_corr := b_ok;
    end if;
  else
    b_corr := false;
  end if;

  m.player_a_correct := m.player_a_correct + case when a_corr then 1 else 0 end;
  m.player_b_correct := m.player_b_correct + case when b_corr then 1 else 0 end;

  if m.player_a_correct >= 3 or m.player_b_correct >= 3 then
    m.state := 'FINISHED';
    m.finished_at := v_now;
    if m.player_a_correct > m.player_b_correct then
      m.winner := m.player_a;
    elsif m.player_b_correct > m.player_a_correct then
      m.winner := m.player_b;
    else
      m.winner := null;
    end if;

    if m.player_b is not null then
      select u.elo into elo_a from public.users u where u.clerk_id = m.player_a;
      select u.elo into elo_b from public.users u where u.clerk_id = m.player_b;
      if elo_a is null then elo_a := 1000; end if;
      if elo_b is null then elo_b := 1000; end if;

      m.player_a_elo_before := elo_a;
      m.player_b_elo_before := elo_b;

      if m.winner = m.player_a then
        v_expected := 1.0 / (1.0 + power(10.0, (elo_b - elo_a) / 400.0));
        v_delta_a := round(v_k * (1.0 - v_expected))::integer;
      elsif m.winner = m.player_b then
        v_expected := 1.0 / (1.0 + power(10.0, (elo_b - elo_a) / 400.0));
        v_delta_a := round(v_k * (0.0 - v_expected))::integer;
      else
        v_expected := 1.0 / (1.0 + power(10.0, (elo_b - elo_a) / 400.0));
        v_delta_a := round(v_k * (0.5 - v_expected))::integer;
      end if;

      m.player_a_elo_after := elo_a + v_delta_a;
      m.player_b_elo_after := elo_b - v_delta_a;

      update public.users u
      set elo = m.player_a_elo_after, updated_at = v_now
      where u.clerk_id = m.player_a;

      update public.users u
      set elo = m.player_b_elo_after, updated_at = v_now
      where u.clerk_id = m.player_b;
    end if;

    update public.blitz_matches
    set
      player_a_correct = m.player_a_correct,
      player_b_correct = m.player_b_correct,
      state = m.state,
      winner = m.winner,
      finished_at = m.finished_at,
      player_a_elo_before = m.player_a_elo_before,
      player_a_elo_after = m.player_a_elo_after,
      player_b_elo_before = m.player_b_elo_before,
      player_b_elo_after = m.player_b_elo_after
    where id = p_match_id
    returning * into m;

    return m;
  end if;

  if m.current_q >= v_len - 1 then
    m.state := 'FINISHED';
    m.finished_at := v_now;
    if m.player_a_correct > m.player_b_correct then
      m.winner := m.player_a;
    elsif m.player_b_correct > m.player_a_correct then
      m.winner := m.player_b;
    else
      m.winner := null;
    end if;

    if m.player_b is not null then
      select u.elo into elo_a from public.users u where u.clerk_id = m.player_a;
      select u.elo into elo_b from public.users u where u.clerk_id = m.player_b;
      if elo_a is null then elo_a := 1000; end if;
      if elo_b is null then elo_b := 1000; end if;
      m.player_a_elo_before := elo_a;
      m.player_b_elo_before := elo_b;
      if m.winner = m.player_a then
        v_expected := 1.0 / (1.0 + power(10.0, (elo_b - elo_a) / 400.0));
        v_delta_a := round(v_k * (1.0 - v_expected))::integer;
      elsif m.winner = m.player_b then
        v_expected := 1.0 / (1.0 + power(10.0, (elo_b - elo_a) / 400.0));
        v_delta_a := round(v_k * (0.0 - v_expected))::integer;
      else
        v_expected := 1.0 / (1.0 + power(10.0, (elo_b - elo_a) / 400.0));
        v_delta_a := round(v_k * (0.5 - v_expected))::integer;
      end if;
      m.player_a_elo_after := elo_a + v_delta_a;
      m.player_b_elo_after := elo_b - v_delta_a;
      update public.users u set elo = m.player_a_elo_after, updated_at = v_now where u.clerk_id = m.player_a;
      update public.users u set elo = m.player_b_elo_after, updated_at = v_now where u.clerk_id = m.player_b;
    end if;

    update public.blitz_matches
    set
      player_a_correct = m.player_a_correct,
      player_b_correct = m.player_b_correct,
      state = m.state,
      winner = m.winner,
      finished_at = m.finished_at,
      player_a_elo_before = m.player_a_elo_before,
      player_a_elo_after = m.player_a_elo_after,
      player_b_elo_before = m.player_b_elo_before,
      player_b_elo_after = m.player_b_elo_after
    where id = p_match_id
    returning * into m;

    return m;
  end if;

  m.current_q := m.current_q + 1;
  m.q_started_at := v_now;

  update public.blitz_matches
  set
    player_a_correct = m.player_a_correct,
    player_b_correct = m.player_b_correct,
    current_q = m.current_q,
    q_started_at = m.q_started_at
  where id = p_match_id
  returning * into m;

  return m;
end;
$$;

-- ---------------------------------------------------------------------------
-- Gauntlet / Colosseum RPC
-- ---------------------------------------------------------------------------
create or replace function public.record_gauntlet_attempt(
  p_user_id text,
  p_concept_id uuid,
  p_drop_date date,
  p_persona_slug text,
  p_correct_count integer,
  p_elapsed_seconds integer,
  p_performance numeric,
  p_is_ranked boolean,
  p_elo_delta integer,
  p_xp_delta integer,
  p_new_streak integer,
  p_streak_date date
)
returns public.gauntlet_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users;
  v_row public.gauntlet_attempts;
  v_total integer;
  v_elo_after integer;
  v_xp_after integer;
begin
  select * into v_user from public.users where clerk_id = p_user_id for update;
  if not found then
    raise exception 'user not found';
  end if;

  v_total := coalesce(
    (
      select jsonb_array_length(dd.questions)
      from public.daily_drops dd
      where dd.drop_date = p_drop_date
        and dd.concept_id = p_concept_id
      limit 1
    ),
    greatest(p_correct_count, 1)
  );

  v_elo_after := v_user.elo + case when p_is_ranked then p_elo_delta else 0 end;
  v_xp_after := v_user.xp + p_xp_delta;

  insert into public.gauntlet_attempts (
    user_id,
    concept_id,
    drop_date,
    persona_slug,
    correct_count,
    total_count,
    elapsed_seconds,
    performance,
    is_ranked,
    elo_before,
    elo_after,
    elo_delta,
    xp_awarded
  )
  values (
    p_user_id,
    p_concept_id,
    p_drop_date,
    p_persona_slug,
    p_correct_count,
    v_total,
    p_elapsed_seconds,
    p_performance,
    p_is_ranked,
    v_user.elo,
    v_elo_after,
    case when p_is_ranked then p_elo_delta else 0 end,
    p_xp_delta
  )
  returning * into v_row;

  update public.users
  set
    elo = v_elo_after,
    xp = v_xp_after,
    rank = public.rank_for_xp(v_xp_after),
    current_streak = p_new_streak,
    last_streak_date = p_streak_date,
    updated_at = now()
  where clerk_id = p_user_id;

  return v_row;
end;
$$;

grant execute on function public.dequeue_blitz_partner(text, text, uuid, jsonb) to anon, authenticated;
grant execute on function public.start_blitz_phase(uuid) to anon, authenticated;
grant execute on function public.record_blitz_answer(uuid, text, integer, integer) to anon, authenticated;
grant execute on function public.advance_blitz_question(uuid, boolean) to anon, authenticated;
grant execute on function public.record_gauntlet_attempt(
  text, uuid, date, text, integer, integer, numeric, boolean, integer, integer, integer, date
) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS + read policies (demo anon policies added in 20260425)
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.subjects enable row level security;
alter table public.personas enable row level security;
alter table public.concepts enable row level security;
alter table public.daily_drops enable row level security;
alter table public.study_rooms enable row level security;
alter table public.study_room_members enable row level security;
alter table public.blitz_queue enable row level security;
alter table public.blitz_matches enable row level security;
alter table public.blitz_answers enable row level security;
alter table public.gauntlet_attempts enable row level security;
alter table public.learning_fingerprints enable row level security;
alter table public.flashcards enable row level security;
alter table public.radio_episodes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'subjects' and policyname = 'subjects read all'
  ) then
    create policy "subjects read all" on public.subjects for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'personas' and policyname = 'personas read all'
  ) then
    create policy "personas read all" on public.personas for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'concepts' and policyname = 'concepts read all'
  ) then
    create policy "concepts read all" on public.concepts for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'daily_drops' and policyname = 'daily_drops read all'
  ) then
    create policy "daily_drops read all" on public.daily_drops for select using (true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Storage bucket for radio (policies in later migration)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('radio', 'radio', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Seed: personas + minimal curriculum (so Blitz / drops can run)
-- ---------------------------------------------------------------------------
insert into public.personas (slug, name, tagline, accent_color, system_prompt)
values
  ('mr_viral', 'Mr. Viral', 'YouTuber-energy explainer', '#ff3b6f', 'You are MR. VIRAL.'),
  ('tech_reviewer', 'Tech Reviewer', 'Gadget-review framing', '#22d3ee', 'You are TECH REVIEWER.'),
  ('twitch_streamer', 'Twitch Streamer', 'Hype + chat brain', '#a78bfa', 'You are TWITCH STREAMER.'),
  ('drill_sergeant', 'Drill Sergeant', 'High-intensity recall', '#f97316', 'You are DRILL SERGEANT.'),
  ('gen_z', 'Gen Z', 'Chaotic-good analogies', '#4ade80', 'You are GEN Z.'),
  ('professor', 'The Professor', 'Classic Socratic rigor', '#3b82f6', 'You are THE PROFESSOR.')
on conflict (slug) do nothing;

insert into public.subjects (id, name, category)
values (
  '00000000-0000-4000-8000-000000000001',
  'General',
  'seed'
)
on conflict (id) do nothing;

insert into public.concepts (id, subject_id, title, text, difficulty)
values
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000001',
    'Newton''s second law',
    'F = m a relates net force on a body to its mass and acceleration. Units: N = kg m / s^2.',
    2
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000001',
    'Conservation of energy',
    'In an isolated system, total energy stays constant as it transforms between kinetic, potential, thermal, and other forms.',
    2
  ),
  (
    '00000000-0000-4000-8000-000000000103',
    '00000000-0000-4000-8000-000000000001',
    'Derivatives as slopes',
    'The derivative f''(x) is the instantaneous rate of change of f at x, geometrically the slope of the tangent line.',
    3
  )
on conflict (id) do nothing;
