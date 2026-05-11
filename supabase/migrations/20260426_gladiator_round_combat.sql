-- Gladiator Arena v2: simultaneous round combat with timer + speed advantage.

alter table if exists public.gladiator_matches
  add column if not exists round_number integer not null default 1,
  add column if not exists round_started_at timestamptz not null default now(),
  add column if not exists round_seconds integer not null default 12,
  add column if not exists p1_round_choice integer,
  add column if not exists p2_round_choice integer,
  add column if not exists p1_answered_at timestamptz,
  add column if not exists p2_answered_at timestamptz,
  add column if not exists last_round_summary jsonb not null default '{}'::jsonb;

create or replace function public.submit_gladiator_answer(
  p_match_id uuid,
  p_actor_id text,
  p_choice integer,
  p_answered_at timestamptz default now()
)
returns public.gladiator_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.gladiator_matches;
  v_correct_idx integer;
  v_p1_correct boolean;
  v_p2_correct boolean;
  v_speed_winner text;
begin
  select * into v_match
  from public.gladiator_matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'gladiator match not found';
  end if;
  if v_match.status <> 'IN_PROGRESS' then
    return v_match;
  end if;
  if p_actor_id not in (v_match.player_one_id, v_match.player_two_id) then
    raise exception 'actor is not a participant of this match';
  end if;

  if p_actor_id = v_match.player_one_id then
    if v_match.p1_answered_at is not null then
      return v_match;
    end if;
    v_match.p1_round_choice := p_choice;
    v_match.p1_answered_at := coalesce(p_answered_at, now());
  else
    if v_match.p2_answered_at is not null then
      return v_match;
    end if;
    v_match.p2_round_choice := p_choice;
    v_match.p2_answered_at := coalesce(p_answered_at, now());
  end if;

  if v_match.p1_answered_at is not null and v_match.p2_answered_at is not null then
    v_correct_idx := coalesce((v_match.current_question ->> 'correctIndex')::integer, -1);
    v_p1_correct := v_match.p1_round_choice = v_correct_idx;
    v_p2_correct := v_match.p2_round_choice = v_correct_idx;

    if v_p1_correct and not v_p2_correct then
      v_match.p1_score := v_match.p1_score + 50;
      v_match.p2_health := greatest(0, v_match.p2_health - 25);
      v_speed_winner := v_match.player_one_id;
    elsif v_p2_correct and not v_p1_correct then
      v_match.p2_score := v_match.p2_score + 50;
      v_match.p1_health := greatest(0, v_match.p1_health - 25);
      v_speed_winner := v_match.player_two_id;
    elsif v_p1_correct and v_p2_correct then
      if v_match.p1_answered_at <= v_match.p2_answered_at then
        v_match.p1_score := v_match.p1_score + 60;
        v_match.p2_score := v_match.p2_score + 30;
        v_match.p2_health := greatest(0, v_match.p2_health - 25);
        v_speed_winner := v_match.player_one_id;
      else
        v_match.p2_score := v_match.p2_score + 60;
        v_match.p1_score := v_match.p1_score + 30;
        v_match.p1_health := greatest(0, v_match.p1_health - 25);
        v_speed_winner := v_match.player_two_id;
      end if;
    else
      v_match.p1_health := greatest(0, v_match.p1_health - 10);
      v_match.p2_health := greatest(0, v_match.p2_health - 10);
      v_speed_winner := null;
    end if;

    v_match.last_round_summary := jsonb_build_object(
      'round', v_match.round_number,
      'correct_index', v_correct_idx,
      'p1_correct', v_p1_correct,
      'p2_correct', v_p2_correct,
      'speed_winner', v_speed_winner,
      'resolved_at', now()
    );

    if v_match.p1_health = 0 and v_match.p2_health = 0 then
      -- tie-break by score
      if v_match.p1_score >= v_match.p2_score then
        v_match.status := 'P1_WON';
        v_match.winner_id := v_match.player_one_id;
      else
        v_match.status := 'P2_WON';
        v_match.winner_id := v_match.player_two_id;
      end if;
      v_match.phase := 'FINISHED';
    elsif v_match.p1_health = 0 then
      v_match.status := 'P2_WON';
      v_match.winner_id := v_match.player_two_id;
      v_match.phase := 'FINISHED';
    elsif v_match.p2_health = 0 then
      v_match.status := 'P1_WON';
      v_match.winner_id := v_match.player_one_id;
      v_match.phase := 'FINISHED';
    else
      v_match.phase := 'RESOLVING';
    end if;
  end if;

  update public.gladiator_matches
  set
    p1_round_choice = v_match.p1_round_choice,
    p2_round_choice = v_match.p2_round_choice,
    p1_answered_at = v_match.p1_answered_at,
    p2_answered_at = v_match.p2_answered_at,
    p1_health = v_match.p1_health,
    p2_health = v_match.p2_health,
    p1_score = v_match.p1_score,
    p2_score = v_match.p2_score,
    status = v_match.status,
    phase = v_match.phase,
    winner_id = v_match.winner_id,
    last_round_summary = v_match.last_round_summary
  where id = p_match_id
  returning * into v_match;

  return v_match;
end;
$$;

create or replace function public.resolve_gladiator_timeout(
  p_match_id uuid
)
returns public.gladiator_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.gladiator_matches;
  v_now timestamptz := now();
  v_correct_idx integer;
  v_p1_correct boolean;
  v_p2_correct boolean;
begin
  select * into v_match
  from public.gladiator_matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'gladiator match not found';
  end if;
  if v_match.status <> 'IN_PROGRESS' then
    return v_match;
  end if;
  if v_match.phase = 'RESOLVING' then
    return v_match;
  end if;
  if v_now < v_match.round_started_at + make_interval(secs => v_match.round_seconds) then
    return v_match;
  end if;

  if v_match.p1_answered_at is null then
    v_match.p1_round_choice := -1;
    v_match.p1_answered_at := v_now;
  end if;
  if v_match.p2_answered_at is null then
    v_match.p2_round_choice := -1;
    v_match.p2_answered_at := v_now;
  end if;

  v_correct_idx := coalesce((v_match.current_question ->> 'correctIndex')::integer, -1);
  v_p1_correct := v_match.p1_round_choice = v_correct_idx;
  v_p2_correct := v_match.p2_round_choice = v_correct_idx;

  if v_p1_correct and not v_p2_correct then
    v_match.p1_score := v_match.p1_score + 50;
    v_match.p2_health := greatest(0, v_match.p2_health - 25);
  elsif v_p2_correct and not v_p1_correct then
    v_match.p2_score := v_match.p2_score + 50;
    v_match.p1_health := greatest(0, v_match.p1_health - 25);
  elsif not v_p1_correct and not v_p2_correct then
    v_match.p1_health := greatest(0, v_match.p1_health - 10);
    v_match.p2_health := greatest(0, v_match.p2_health - 10);
  end if;

  v_match.last_round_summary := jsonb_build_object(
    'round', v_match.round_number,
    'correct_index', v_correct_idx,
    'p1_correct', v_p1_correct,
    'p2_correct', v_p2_correct,
    'speed_winner', null,
    'resolved_at', v_now,
    'reason', 'timeout'
  );

  if v_match.p1_health = 0 and v_match.p2_health = 0 then
    if v_match.p1_score >= v_match.p2_score then
      v_match.status := 'P1_WON';
      v_match.winner_id := v_match.player_one_id;
    else
      v_match.status := 'P2_WON';
      v_match.winner_id := v_match.player_two_id;
    end if;
    v_match.phase := 'FINISHED';
  elsif v_match.p1_health = 0 then
    v_match.status := 'P2_WON';
    v_match.winner_id := v_match.player_two_id;
    v_match.phase := 'FINISHED';
  elsif v_match.p2_health = 0 then
    v_match.status := 'P1_WON';
    v_match.winner_id := v_match.player_one_id;
    v_match.phase := 'FINISHED';
  else
    v_match.phase := 'RESOLVING';
  end if;

  update public.gladiator_matches
  set
    p1_round_choice = v_match.p1_round_choice,
    p2_round_choice = v_match.p2_round_choice,
    p1_answered_at = v_match.p1_answered_at,
    p2_answered_at = v_match.p2_answered_at,
    p1_health = v_match.p1_health,
    p2_health = v_match.p2_health,
    p1_score = v_match.p1_score,
    p2_score = v_match.p2_score,
    status = v_match.status,
    phase = v_match.phase,
    winner_id = v_match.winner_id,
    last_round_summary = v_match.last_round_summary
  where id = p_match_id
  returning * into v_match;

  return v_match;
end;
$$;

grant execute on function public.submit_gladiator_answer(uuid, text, integer, timestamptz) to anon, authenticated;
grant execute on function public.resolve_gladiator_timeout(uuid) to anon, authenticated;
