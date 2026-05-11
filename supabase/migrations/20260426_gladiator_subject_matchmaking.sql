-- Gladiator matchmaking by selected subject/concept.

alter table if exists public.gladiator_queue
  add column if not exists subject_id uuid references public.subjects(id) on delete set null,
  add column if not exists concept_id uuid references public.concepts(id) on delete set null;

alter table if exists public.gladiator_matches
  add column if not exists subject_id uuid references public.subjects(id) on delete set null,
  add column if not exists concept_id uuid references public.concepts(id) on delete set null;

create index if not exists gladiator_queue_subject_idx
  on public.gladiator_queue (subject_id, concept_id, joined_at);

create or replace function public.dequeue_gladiator_partner(
  p_user_id text,
  p_bot_id text,
  p_current_question jsonb,
  p_force_bot boolean default false,
  p_subject_id uuid default null,
  p_concept_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner text;
  v_partner_subject uuid;
  v_partner_concept uuid;
  v_match public.gladiator_matches;
begin
  if not p_force_bot then
    with candidate as (
      select user_id, subject_id, concept_id
      from public.gladiator_queue
      where user_id <> p_user_id
        and (
          (p_concept_id is not null and concept_id = p_concept_id)
          or (p_concept_id is null and p_subject_id is not null and subject_id = p_subject_id)
        )
      order by joined_at asc
      for update skip locked
      limit 1
    )
    delete from public.gladiator_queue q
    using candidate c
    where q.user_id = c.user_id
    returning c.user_id, c.subject_id, c.concept_id
    into v_partner, v_partner_subject, v_partner_concept;
  end if;

  if v_partner is null then
    delete from public.gladiator_queue where user_id = p_user_id;
    insert into public.gladiator_queue (user_id, subject_id, concept_id)
    values (p_user_id, p_subject_id, p_concept_id)
    on conflict (user_id) do update
      set joined_at = now(),
          subject_id = excluded.subject_id,
          concept_id = excluded.concept_id;

    if p_force_bot then
      v_partner := p_bot_id;
      v_partner_subject := p_subject_id;
      v_partner_concept := p_concept_id;
      delete from public.gladiator_queue where user_id = p_user_id;
    else
      return null;
    end if;
  else
    delete from public.gladiator_queue where user_id = p_user_id;
  end if;

  insert into public.gladiator_matches (
    player_one_id,
    player_two_id,
    current_turn,
    current_question,
    is_bot_match,
    subject_id,
    concept_id
  )
  values (
    p_user_id,
    v_partner,
    p_user_id,
    coalesce(p_current_question, '{}'::jsonb),
    v_partner = p_bot_id,
    coalesce(p_subject_id, v_partner_subject),
    coalesce(p_concept_id, v_partner_concept)
  )
  returning * into v_match;

  return v_match.id;
end;
$$;

grant execute on function public.dequeue_gladiator_partner(text, text, jsonb, boolean, uuid, uuid) to anon, authenticated;
