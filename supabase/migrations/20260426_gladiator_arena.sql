-- Gladiator Arena core schema + economy RPCs.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'gladiator_match_status') then
    create type public.gladiator_match_status as enum ('IN_PROGRESS', 'P1_WON', 'P2_WON');
  end if;
  if not exists (select 1 from pg_type where typname = 'gladiator_combat_phase') then
    create type public.gladiator_combat_phase as enum ('QUESTION', 'RESOLVING', 'FINISHED');
  end if;
end $$;

create table if not exists public.gladiator_profiles (
  user_id text primary key references public.users(clerk_id) on delete cascade,
  glory_points integer not null default 0 check (glory_points >= 0),
  total_wins integer not null default 0 check (total_wins >= 0),
  worldwide_score integer not null default 1000 check (worldwide_score >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_items (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text not null,
  icon text,
  price integer not null check (price >= 0),
  effect jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.user_inventory (
  id bigserial primary key,
  user_id text not null references public.users(clerk_id) on delete cascade,
  item_id uuid not null references public.store_items(id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, item_id)
);

create table if not exists public.gladiator_matches (
  id uuid primary key default gen_random_uuid(),
  player_one_id text not null references public.users(clerk_id) on delete cascade,
  player_two_id text not null references public.users(clerk_id) on delete cascade,
  current_turn text not null references public.users(clerk_id) on delete cascade,
  current_question jsonb not null default '{}'::jsonb,
  p1_health integer not null default 100 check (p1_health between 0 and 100),
  p2_health integer not null default 100 check (p2_health between 0 and 100),
  p1_score integer not null default 0,
  p2_score integer not null default 0,
  winner_id text references public.users(clerk_id) on delete set null,
  status public.gladiator_match_status not null default 'IN_PROGRESS',
  phase public.gladiator_combat_phase not null default 'QUESTION',
  is_bot_match boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gladiator_queue (
  user_id text primary key references public.users(clerk_id) on delete cascade,
  joined_at timestamptz not null default now()
);

create index if not exists gladiator_profiles_score_idx
  on public.gladiator_profiles (worldwide_score desc, total_wins desc, user_id asc);
create index if not exists user_inventory_user_idx
  on public.user_inventory (user_id, updated_at desc);
create index if not exists gladiator_matches_status_idx
  on public.gladiator_matches (status, updated_at desc);
create index if not exists gladiator_matches_player1_idx
  on public.gladiator_matches (player_one_id, created_at desc);
create index if not exists gladiator_matches_player2_idx
  on public.gladiator_matches (player_two_id, created_at desc);
create index if not exists gladiator_queue_joined_idx
  on public.gladiator_queue (joined_at asc);

create or replace function public._touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_gladiator_profiles_touch on public.gladiator_profiles;
create trigger trg_gladiator_profiles_touch
before update on public.gladiator_profiles
for each row execute function public._touch_updated_at();

drop trigger if exists trg_user_inventory_touch on public.user_inventory;
create trigger trg_user_inventory_touch
before update on public.user_inventory
for each row execute function public._touch_updated_at();

drop trigger if exists trg_gladiator_matches_touch on public.gladiator_matches;
create trigger trg_gladiator_matches_touch
before update on public.gladiator_matches
for each row execute function public._touch_updated_at();

alter table public.gladiator_profiles enable row level security;
alter table public.store_items enable row level security;
alter table public.user_inventory enable row level security;
alter table public.gladiator_matches enable row level security;
alter table public.gladiator_queue enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='gladiator_profiles' and policyname='gladiator_profiles read all'
  ) then
    create policy "gladiator_profiles read all" on public.gladiator_profiles for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='store_items' and policyname='store_items read all'
  ) then
    create policy "store_items read all" on public.store_items for select using (active);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='user_inventory' and policyname='user_inventory read own'
  ) then
    create policy "user_inventory read own" on public.user_inventory for select using (auth.jwt() ->> 'sub' = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='gladiator_matches' and policyname='gladiator_matches read participant'
  ) then
    create policy "gladiator_matches read participant" on public.gladiator_matches for select using (
      auth.jwt() ->> 'sub' = player_one_id or auth.jwt() ->> 'sub' = player_two_id
    );
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='gladiator_queue' and policyname='gladiator_queue read own'
  ) then
    create policy "gladiator_queue read own" on public.gladiator_queue for select using (auth.jwt() ->> 'sub' = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='gladiator_profiles' and policyname='demo: gladiator_profiles anon all'
  ) then
    create policy "demo: gladiator_profiles anon all" on public.gladiator_profiles for all to anon using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='store_items' and policyname='demo: store_items anon all'
  ) then
    create policy "demo: store_items anon all" on public.store_items for all to anon using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='user_inventory' and policyname='demo: user_inventory anon all'
  ) then
    create policy "demo: user_inventory anon all" on public.user_inventory for all to anon using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='gladiator_matches' and policyname='demo: gladiator_matches anon all'
  ) then
    create policy "demo: gladiator_matches anon all" on public.gladiator_matches for all to anon using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='gladiator_queue' and policyname='demo: gladiator_queue anon all'
  ) then
    create policy "demo: gladiator_queue anon all" on public.gladiator_queue for all to anon using (true) with check (true);
  end if;
end $$;

create or replace function public.process_gladiator_hit(
  p_match_id uuid,
  p_actor_id text,
  p_is_correct boolean,
  p_damage integer default 25,
  p_points_on_correct integer default 50
)
returns public.gladiator_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.gladiator_matches;
  v_damage integer := greatest(1, least(coalesce(p_damage, 25), 100));
  v_points integer := greatest(0, coalesce(p_points_on_correct, 50));
  v_actor_is_p1 boolean;
begin
  select *
  into v_match
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

  v_actor_is_p1 := p_actor_id = v_match.player_one_id;

  if p_is_correct then
    if v_actor_is_p1 then
      v_match.p1_score := v_match.p1_score + v_points;
    else
      v_match.p2_score := v_match.p2_score + v_points;
    end if;
  else
    if v_actor_is_p1 then
      v_match.p1_health := greatest(0, v_match.p1_health - v_damage);
    else
      v_match.p2_health := greatest(0, v_match.p2_health - v_damage);
    end if;
  end if;

  if v_match.p1_health = 0 then
    v_match.status := 'P2_WON';
    v_match.phase := 'FINISHED';
    v_match.winner_id := v_match.player_two_id;
  elsif v_match.p2_health = 0 then
    v_match.status := 'P1_WON';
    v_match.phase := 'FINISHED';
    v_match.winner_id := v_match.player_one_id;
  else
    v_match.phase := 'QUESTION';
    v_match.current_turn :=
      case when v_match.current_turn = v_match.player_one_id
        then v_match.player_two_id else v_match.player_one_id end;
  end if;

  update public.gladiator_matches
  set
    p1_health = v_match.p1_health,
    p2_health = v_match.p2_health,
    p1_score = v_match.p1_score,
    p2_score = v_match.p2_score,
    winner_id = v_match.winner_id,
    status = v_match.status,
    phase = v_match.phase,
    current_turn = v_match.current_turn
  where id = p_match_id
  returning * into v_match;

  if v_match.status <> 'IN_PROGRESS' and v_match.winner_id is not null then
    insert into public.gladiator_profiles (user_id, total_wins, glory_points, worldwide_score)
    values (v_match.winner_id, 1, 120, 25)
    on conflict (user_id) do update
      set total_wins = public.gladiator_profiles.total_wins + 1,
          glory_points = public.gladiator_profiles.glory_points + 120,
          worldwide_score = public.gladiator_profiles.worldwide_score + 25;
  end if;

  return v_match;
end;
$$;

create or replace function public.dequeue_gladiator_partner(
  p_user_id text,
  p_bot_id text,
  p_current_question jsonb,
  p_force_bot boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner text;
  v_match public.gladiator_matches;
begin
  delete from public.gladiator_queue where user_id = p_user_id;

  if not p_force_bot then
    with candidate as (
      select user_id
      from public.gladiator_queue
      where user_id <> p_user_id
      order by joined_at asc
      for update skip locked
      limit 1
    )
    delete from public.gladiator_queue q
    using candidate c
    where q.user_id = c.user_id
    returning c.user_id into v_partner;
  end if;

  if v_partner is null then
    v_partner := p_bot_id;
  end if;

  insert into public.gladiator_matches (
    player_one_id,
    player_two_id,
    current_turn,
    current_question,
    is_bot_match
  )
  values (
    p_user_id,
    v_partner,
    p_user_id,
    coalesce(p_current_question, '{}'::jsonb),
    v_partner = p_bot_id
  )
  returning * into v_match;

  return v_match.id;
end;
$$;

create or replace function public.purchase_store_item(
  p_user_id text,
  p_item_id uuid
)
returns public.user_inventory
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.gladiator_profiles;
  v_item public.store_items;
  v_inventory public.user_inventory;
begin
  select * into v_profile
  from public.gladiator_profiles
  where user_id = p_user_id
  for update;

  if not found then
    insert into public.gladiator_profiles (user_id, glory_points, total_wins, worldwide_score)
    values (p_user_id, 0, 0, 1000)
    on conflict (user_id) do nothing;
    select * into v_profile
    from public.gladiator_profiles
    where user_id = p_user_id
    for update;
  end if;

  select * into v_item
  from public.store_items
  where id = p_item_id and active = true;

  if not found then
    raise exception 'store item not found or inactive';
  end if;

  if v_profile.glory_points < v_item.price then
    raise exception 'insufficient glory points';
  end if;

  update public.gladiator_profiles
  set glory_points = glory_points - v_item.price
  where user_id = p_user_id;

  insert into public.user_inventory (user_id, item_id, quantity)
  values (p_user_id, p_item_id, 1)
  on conflict (user_id, item_id) do update
    set quantity = public.user_inventory.quantity + 1
  returning * into v_inventory;

  return v_inventory;
end;
$$;

grant execute on function public.process_gladiator_hit(uuid, text, boolean, integer, integer) to anon, authenticated;
grant execute on function public.dequeue_gladiator_partner(text, text, jsonb, boolean) to anon, authenticated;
grant execute on function public.purchase_store_item(text, uuid) to anon, authenticated;

insert into public.store_items (slug, name, description, icon, price, effect, active)
values
  ('aegis-shield', 'Aegis Shield', 'Blocks one wrong-answer hit.', '🛡', 180, '{"type":"block_hit","charges":1}'::jsonb, true),
  ('hermes-sandal', 'Hermes Sandal', 'Improves answer timer multiplier.', '👟', 140, '{"type":"time_multiplier","multiplier":0.85}'::jsonb, true),
  ('ares-edge', 'Ares Edge', 'Increase your damage on rival mistakes.', '⚔', 220, '{"type":"bonus_damage","value":10}'::jsonb, true)
on conflict (slug) do nothing;

alter publication supabase_realtime add table public.gladiator_matches;
