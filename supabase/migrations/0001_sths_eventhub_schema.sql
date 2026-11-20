-- =============================================================================
-- STHS EventHub (Wits School of Therapeutic Sciences) — Production Schema v1.0
-- Platforms unified: EventsAir + Whova + EasyChair + Cvent
-- Security: RLS enabled on ALL public tables, explicit GRANTs, (select auth.uid()),
--           private schema role helpers, anti-escalation triggers, Storage RLS.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- 1. PRIVATE SCHEMA (Not exposed to PostgREST Data API)
-- -----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- Answer key vault for Amazing Race & Scavenger Hunt (never exposed to clients)
create table if not exists private.quest_answer_keys (
  quest_id uuid primary key,
  accepted_answers text[] not null default '{}',
  updated_at timestamptz not null default now()
);
revoke all on table private.quest_answer_keys from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. PROFILES (1:1 with auth.users)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  academic_title text not null default '',
  university text not null default 'University of the Witwatersrand (Wits)',
  faculty_department text not null default '',
  bio text not null default '',
  research_tags text[] not null default '{}',
  avatar_url text not null default '',
  orcid_or_website text not null default '',
  platform_role text not null default 'member'
    check (platform_role in ('member', 'organizer', 'super_admin')),
  public_directory boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_university on public.profiles (university);
create index if not exists idx_profiles_platform_role on public.profiles (platform_role);

-- Prevent non-super-admins from self-escalating platform_role
create or replace function private.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text;
begin
  if new.platform_role is distinct from old.platform_role then
    select p.platform_role into v_caller_role
    from public.profiles p
    where p.id = (select auth.uid());

    if coalesce(v_caller_role, '') <> 'super_admin' and current_user not in ('postgres', 'service_role') then
      raise exception 'Only a platform super_admin can modify platform_role';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_role on public.profiles;
create trigger trg_guard_profile_role
  before update on public.profiles
  for each row execute function private.guard_profile_role();

-- Auto-create profile when a user signs up (Email, Magic Link, or GitHub OAuth)
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_avatar text;
begin
  v_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'user_name',
    split_part(coalesce(new.email, ''), '@', 1)
  );
  v_avatar := coalesce(new.raw_user_meta_data ->> 'avatar_url', '');

  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, coalesce(new.email, ''), v_name, v_avatar)
  on conflict (id) do update
    set email = excluded.email,
        full_name = case when public.profiles.full_name = '' then excluded.full_name else public.profiles.full_name end,
        avatar_url = case when public.profiles.avatar_url = '' then excluded.avatar_url else public.profiles.avatar_url end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- 3. EVENTS CATALOG (Multi-Event STHS Umbrella Platform)
-- -----------------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  short_title text not null default '',
  tagline text not null default '',
  description text not null default '',
  department text not null default 'School of Therapeutic Sciences',
  host_unit text not null default 'Wits School of Therapeutic Sciences & eFundanathi eZone',
  venue text not null default 'Wits Education Campus & Online',
  start_date date,
  end_date date,
  date_label text not null default '',
  format text not null default 'Hybrid (In-Person + Zoom & MS Teams)',
  status text not null default 'upcoming'
    check (status in ('active', 'registration_open', 'upcoming', 'archived')),
  site_path text not null default '',
  subdomain_hint text not null default '',
  banner_image_url text not null default '',
  accent_color text not null default '#007377',
  contact_email text not null default 'help.efundanathi@wits.ac.za',
  contact_phone text not null default '+27 11 717 3259',
  is_featured boolean not null default false,
  is_published boolean not null default true,
  gdrive_webhook_url text not null default '',
  gdrive_root_url text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_events_status on public.events (status);
create index if not exists idx_events_department on public.events (department);

-- -----------------------------------------------------------------------------
-- 4. EVENT REGISTRATIONS & ROLES (Per-Event Membership, Digital Badge & XP)
-- -----------------------------------------------------------------------------
create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'delegate'
    check (role in ('delegate', 'speaker', 'student', 'reviewer', 'exhibitor', 'organizer')),
  attendance_mode text not null default 'in_person'
    check (attendance_mode in ('in_person', 'online')),
  badge_code text not null unique default ('STHS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  checked_in boolean not null default false,
  checked_in_at timestamptz,
  dietary_accessibility text not null default '',
  session_title text not null default '',
  primary_track text not null default '',
  presentation_file_url text not null default '',
  presentation_file_name text not null default '',
  public_in_directory boolean not null default true,
  xp_points integer not null default 100 check (xp_points >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index if not exists idx_event_reg_event on public.event_registrations (event_id);
create index if not exists idx_event_reg_user on public.event_registrations (user_id);
create index if not exists idx_event_reg_role on public.event_registrations (event_id, role);

-- -----------------------------------------------------------------------------
-- 5. SECURITY HELPER FUNCTIONS (Private schema, explicit auth.uid() checks)
-- -----------------------------------------------------------------------------
create or replace function private.is_platform_organizer()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.platform_role in ('organizer', 'super_admin')
  );
$$;

create or replace function private.is_event_organizer(p_event_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.platform_role in ('organizer', 'super_admin')
    )
    or exists (
      select 1 from public.event_registrations er
      where er.event_id = p_event_id
        and er.user_id = (select auth.uid())
        and er.role = 'organizer'
    )
  );
$$;

create or replace function private.is_event_reviewer(p_event_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select (
    private.is_event_organizer(p_event_id)
    or exists (
      select 1 from public.event_registrations er
      where er.event_id = p_event_id
        and er.user_id = (select auth.uid())
        and er.role in ('reviewer', 'organizer')
    )
  );
$$;

revoke all on function private.is_platform_organizer() from public, anon;
revoke all on function private.is_event_organizer(uuid) from public, anon;
revoke all on function private.is_event_reviewer(uuid) from public, anon;
grant execute on function private.is_platform_organizer() to authenticated;
grant execute on function private.is_event_organizer(uuid) to authenticated;
grant execute on function private.is_event_reviewer(uuid) to authenticated;

-- Prevent self-promotion to organizer/reviewer or direct XP tampering on event_registrations
create or replace function private.guard_registration_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_org boolean;
begin
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;

  v_is_org := private.is_event_organizer(new.event_id);

  if tg_op = 'INSERT' then
    if new.role in ('organizer', 'reviewer') and not v_is_org then
      new.role := 'delegate';
    end if;
    if not v_is_org then
      new.xp_points := 100;
      new.checked_in := false;
      new.checked_in_at := null;
    end if;
  elsif tg_op = 'UPDATE' then
    if not v_is_org then
      if new.role in ('organizer', 'reviewer') and new.role is distinct from old.role then
        raise exception 'Only event organizers can assign organizer or reviewer roles';
      end if;
      new.xp_points := old.xp_points;
      new.badge_code := old.badge_code;
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_registration_mutation on public.event_registrations;
create trigger trg_guard_registration_mutation
  before insert or update on public.event_registrations
  for each row execute function private.guard_registration_mutation();

-- -----------------------------------------------------------------------------
-- 6. TRACKS, SESSIONS, PERSONAL CALENDAR & CHECK-INS
-- -----------------------------------------------------------------------------
create table if not exists public.event_tracks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  track_code text not null,
  title text not null,
  subtitle text not null default '',
  topics text[] not null default '{}',
  drive_folder_path text not null default '',
  color_token text not null default 'teal',
  sort_order integer not null default 1,
  unique (event_id, track_code)
);

create index if not exists idx_event_tracks_event on public.event_tracks (event_id);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  track_code text not null default 'Plenary',
  day_label text not null default 'Day 1 · Thu 11 Mar 2027',
  start_time text not null default '09:00',
  end_time text not null default '10:00',
  starts_at timestamptz,
  ends_at timestamptz,
  title text not null,
  description text not null default '',
  format text not null default 'Hybrid Session',
  room text not null default 'eFundanathi eZone Main Auditorium',
  stream_platform text not null default 'Zoom'
    check (stream_platform in ('Zoom', 'MS Teams', 'In-Person', 'Hybrid')),
  stream_url text not null default '',
  speaker_names text not null default '',
  speaker_universities text not null default '',
  slides_url text not null default '',
  slides_name text not null default '',
  handout_urls jsonb not null default '[]'::jsonb,
  is_published boolean not null default true,
  sort_order integer not null default 10,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sessions_event on public.sessions (event_id);

create table if not exists public.saved_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create index if not exists idx_saved_sessions_user on public.saved_sessions (user_id, event_id);

create table if not exists public.session_checkins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint check (rating between 1 and 5),
  feedback text not null default '',
  checked_in_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create index if not exists idx_session_checkins_user on public.session_checkins (user_id, event_id);

-- -----------------------------------------------------------------------------
-- 7. ABSTRACTS & EASYCHAIR-GRADE PEER REVIEW
-- -----------------------------------------------------------------------------
create table if not exists public.abstracts (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique default ('ABS-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5))),
  event_id uuid not null references public.events(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  co_authors text not null default '',
  university text not null default '',
  corresponding_email text not null,
  track_code text not null default 'TRACK 1',
  sub_topic text not null default '',
  presentation_format text not null default 'Oral Presentation (15 min + 5 min Q&A)',
  abstract_text text not null,
  keywords text[] not null default '{}',
  abstract_file_url text not null default '',
  abstract_file_name text not null default '',
  slides_file_url text not null default '',
  slides_file_name text not null default '',
  game_build_url text not null default '',
  game_build_name text not null default '',
  drive_folder_path text not null default '',
  status text not null default 'submitted'
    check (status in ('submitted', 'under_review', 'revision_requested', 'accepted', 'declined', 'scheduled')),
  author_rebuttal text not null default '',
  revised_file_url text not null default '',
  revised_file_name text not null default '',
  promoted_session_id uuid references public.sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_abstracts_event on public.abstracts (event_id);
create index if not exists idx_abstracts_author on public.abstracts (author_id);
create index if not exists idx_abstracts_status on public.abstracts (event_id, status);

create table if not exists public.abstract_reviews (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  abstract_id uuid not null references public.abstracts(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  has_conflict_of_interest boolean not null default false,
  coi_reason text not null default '',
  score_theme_fit smallint check (score_theme_fit between 1 and 5),
  score_rigor smallint check (score_rigor between 1 and 5),
  score_innovation smallint check (score_innovation between 1 and 5),
  score_impact smallint check (score_impact between 1 and 5),
  reviewer_confidence smallint default 4 check (reviewer_confidence between 1 and 5),
  weighted_average numeric(3,2) generated always as (
    case
      when score_theme_fit is not null and score_rigor is not null and score_innovation is not null and score_impact is not null
      then round(((score_theme_fit + score_rigor + score_innovation + score_impact)::numeric / 4.0), 2)
      else null
    end
  ) stored,
  recommendation text not null default 'Accept - Oral & Playtest',
  author_feedback text not null default '',
  confidential_chair_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (abstract_id, reviewer_id)
);

create index if not exists idx_abstract_reviews_abstract on public.abstract_reviews (abstract_id);
create index if not exists idx_abstract_reviews_reviewer on public.abstract_reviews (reviewer_id);

-- -----------------------------------------------------------------------------
-- 8. HYBRID LIVE STREAM STAGES, REALTIME Q&A, POLLS & DOCUMENTS VAULT
-- -----------------------------------------------------------------------------
create table if not exists public.stream_stages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  stage_code text not null,
  name text not null,
  platform text not null default 'Zoom'
    check (platform in ('Zoom', 'MS Teams', 'YouTube', 'Vimeo', 'Custom Embed')),
  meeting_id text not null default '',
  passcode text not null default '',
  join_url text not null default '',
  embed_url text not null default '',
  status_label text not null default 'SCHEDULED',
  is_live boolean not null default false,
  current_session_title text not null default '',
  current_speaker text not null default '',
  handout_url text not null default '',
  handout_name text not null default '',
  room_location text not null default '',
  sort_order integer not null default 1,
  unique (event_id, stage_code)
);

create index if not exists idx_stream_stages_event on public.stream_stages (event_id);

create table if not exists public.live_qa_questions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  stage_id uuid not null references public.stream_stages(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_name text not null,
  author_university text not null default '',
  attendance_mode text not null default 'online',
  question_text text not null check (char_length(question_text) between 4 and 600),
  upvote_count integer not null default 0,
  is_answered boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_live_qa_stage on public.live_qa_questions (stage_id, created_at desc);

create table if not exists public.live_qa_upvotes (
  question_id uuid not null references public.live_qa_questions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (question_id, user_id)
);

create or replace function private.sync_qa_upvote_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.live_qa_questions set upvote_count = upvote_count + 1 where id = new.question_id;
  elsif tg_op = 'DELETE' then
    update public.live_qa_questions set upvote_count = greatest(0, upvote_count - 1) where id = old.question_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_sync_qa_upvotes on public.live_qa_upvotes;
create trigger trg_sync_qa_upvotes
  after insert or delete on public.live_qa_upvotes
  for each row execute function private.sync_qa_upvote_count();

create table if not exists public.live_polls (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  stage_id uuid references public.stream_stages(id) on delete set null,
  question text not null,
  options jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_live_polls_event on public.live_polls (event_id);

create table if not exists public.live_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.live_polls(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_index integer not null check (option_index >= 0),
  created_at timestamptz not null default now(),
  unique (poll_id, user_id)
);

create index if not exists idx_live_poll_votes_poll on public.live_poll_votes (poll_id);

create table if not exists public.event_documents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  folder_category text not null default '02_Speaker_Presentations_&_Slide_Decks',
  title text not null,
  description text not null default '',
  file_url text not null,
  file_name text not null,
  file_size_label text not null default '',
  storage_path text not null default '',
  uploaded_by uuid references public.profiles(id) on delete set null,
  uploader_label text not null default '',
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_event_documents_event on public.event_documents (event_id, folder_category);

-- -----------------------------------------------------------------------------
-- 9. GAMIFICATION: AMAZING RACE, SCAVENGER HUNT & LIVE LEADERBOARDS
-- -----------------------------------------------------------------------------
create table if not exists public.gamification_quests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  quest_type text not null check (quest_type in ('amazing_race', 'scavenger_hunt')),
  sort_order integer not null default 1,
  title text not null,
  category text not null default '',
  location text not null default '',
  mode text not null default 'In-Person & Online',
  points integer not null default 150 check (points > 0),
  clue text not null default '',
  hint text not null default '',
  is_active boolean not null default true
);

create index if not exists idx_quests_event on public.gamification_quests (event_id, quest_type, sort_order);

create table if not exists public.quest_completions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  quest_id uuid not null references public.gamification_quests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  points_awarded integer not null default 0,
  completed_at timestamptz not null default now(),
  unique (quest_id, user_id)
);

create index if not exists idx_quest_completions_user on public.quest_completions (user_id, event_id);

-- Server-side answer verifier RPC (prevents client-side cheating & atomically awards XP)
create or replace function public.submit_quest_answer(
  p_quest_id uuid,
  p_answer text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_quest record;
  v_keys text[];
  v_norm text;
  v_already boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Please sign in to participate in quests.');
  end if;

  select * into v_quest from public.gamification_quests where id = p_quest_id and is_active = true;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Quest not found or inactive.');
  end if;

  select exists (
    select 1 from public.quest_completions where quest_id = p_quest_id and user_id = v_uid
  ) into v_already;

  if v_already then
    return jsonb_build_object('ok', true, 'already_completed', true, 'points', 0, 'message', 'Checkpoint already completed!');
  end if;

  select accepted_answers into v_keys from private.quest_answer_keys where quest_id = p_quest_id;
  v_norm := lower(regexp_replace(trim(coalesce(p_answer, '')), '\s+', ' ', 'g'));

  if v_keys is null or not (v_norm = any(v_keys)) then
    return jsonb_build_object('ok', false, 'error', 'Not quite right — check the clue or hint and try again!');
  end if;

  insert into public.quest_completions (event_id, quest_id, user_id, points_awarded)
  values (v_quest.event_id, p_quest_id, v_uid, v_quest.points)
  on conflict (quest_id, user_id) do nothing;

  -- Ensure user has an event registration and add XP atomically
  insert into public.event_registrations (event_id, user_id, xp_points)
  values (v_quest.event_id, v_uid, 100 + v_quest.points)
  on conflict (event_id, user_id) do update
    set xp_points = public.event_registrations.xp_points + v_quest.points,
        updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'already_completed', false,
    'points', v_quest.points,
    'quest_title', v_quest.title
  );
end;
$$;

revoke all on function public.submit_quest_answer(uuid, text) from public, anon;
grant execute on function public.submit_quest_answer(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 10. INTER-UNIVERSITY NETWORKING (DIRECT MESSAGES)
-- -----------------------------------------------------------------------------
create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  message_text text not null check (char_length(message_text) between 1 and 1500),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_dm_recipient on public.direct_messages (recipient_id, event_id, created_at desc);
create index if not exists idx_dm_sender on public.direct_messages (sender_id, event_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 11. SPONSORS, EXHIBITOR BOOTHS, LEAD CAPTURE & PARTNERSHIP PLEDGES
-- -----------------------------------------------------------------------------
create table if not exists public.sponsor_booths (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  tier text not null default 'Partner',
  category text not null default 'Academic & Industry Partner',
  logo_url text not null default '',
  logo_text text not null default '',
  description text not null default '',
  website_url text not null default '',
  contact_email text not null default '',
  scavenger_code text not null default '',
  sort_order integer not null default 10,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_sponsor_booths_event on public.sponsor_booths (event_id);

create table if not exists public.sponsor_leads (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  booth_id uuid not null references public.sponsor_booths(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (booth_id, user_id)
);

create index if not exists idx_sponsor_leads_booth on public.sponsor_leads (booth_id);

create table if not exists public.sponsor_inquiries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  submitted_by uuid references public.profiles(id) on delete set null,
  organization_name text not null,
  contact_name text not null,
  work_email text not null,
  tier_selected text not null,
  logo_file_url text not null default '',
  logo_file_name text not null default '',
  notes text not null default '',
  status text not null default 'new' check (status in ('new', 'contacted', 'confirmed', 'declined')),
  created_at timestamptz not null default now()
);

create index if not exists idx_sponsor_inquiries_event on public.sponsor_inquiries (event_id);

-- -----------------------------------------------------------------------------
-- 12. PUBLIC LEADERBOARD & DIRECTORY RPCs (Privacy-safe, zero email leaks)
-- -----------------------------------------------------------------------------
create or replace function public.get_event_leaderboards(p_event_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'universities', coalesce((
      select jsonb_agg(row_to_json(u))
      from (
        select
          coalesce(nullif(trim(p.university), ''), 'Independent / Partner Institution') as university,
          count(er.id)::int as delegates,
          coalesce(sum(er.xp_points), 0)::int as total_points
        from public.event_registrations er
        join public.profiles p on p.id = er.user_id
        where er.event_id = p_event_id
        group by 1
        order by total_points desc, delegates desc
        limit 25
      ) u
    ), '[]'::jsonb),
    'individuals', coalesce((
      select jsonb_agg(row_to_json(i))
      from (
        select
          p.id as user_id,
          trim(concat_ws(' ', nullif(p.academic_title, ''), nullif(p.full_name, ''))) as display_name,
          p.university,
          er.role,
          er.attendance_mode,
          er.xp_points,
          (select count(*)::int from public.quest_completions qc where qc.event_id = p_event_id and qc.user_id = p.id) as quests_completed
        from public.event_registrations er
        join public.profiles p on p.id = er.user_id
        where er.event_id = p_event_id
        order by er.xp_points desc, er.created_at asc
        limit 25
      ) i
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.get_event_leaderboards(uuid) to anon, authenticated;

create or replace function public.get_public_directory(p_event_id uuid)
returns table (
  user_id uuid,
  display_name text,
  university text,
  faculty_department text,
  bio text,
  research_tags text[],
  avatar_url text,
  role text,
  attendance_mode text,
  session_title text,
  primary_track text,
  presentation_file_url text,
  presentation_file_name text
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    p.id,
    trim(concat_ws(' ', nullif(p.academic_title, ''), nullif(p.full_name, ''))),
    p.university,
    p.faculty_department,
    p.bio,
    p.research_tags,
    p.avatar_url,
    er.role,
    er.attendance_mode,
    er.session_title,
    er.primary_track,
    er.presentation_file_url,
    er.presentation_file_name
  from public.event_registrations er
  join public.profiles p on p.id = er.user_id
  where er.event_id = p_event_id
    and er.public_in_directory = true
  order by
    case er.role
      when 'speaker' then 1
      when 'organizer' then 2
      when 'reviewer' then 3
      else 4
    end,
    p.full_name asc;
$$;

grant execute on function public.get_public_directory(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 13. EXPLICIT DATA API GRANTS & ROW LEVEL SECURITY (EVERY PUBLIC TABLE)
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select on public.events, public.event_tracks, public.sessions, public.stream_stages,
  public.live_qa_questions, public.live_polls, public.live_poll_votes,
  public.event_documents, public.gamification_quests, public.sponsor_booths
  to anon, authenticated;

grant insert, update, delete on public.events, public.event_tracks, public.sessions,
  public.stream_stages, public.live_polls, public.gamification_quests, public.sponsor_booths
  to authenticated;

grant select, insert, update on public.profiles, public.event_registrations, public.abstracts,
  public.abstract_reviews, public.direct_messages
  to authenticated;

grant select, insert, delete on public.saved_sessions, public.session_checkins,
  public.live_qa_questions, public.live_qa_upvotes, public.live_poll_votes,
  public.event_documents, public.quest_completions, public.sponsor_leads
  to authenticated;

grant insert on public.sponsor_inquiries to anon, authenticated;
grant select, update on public.sponsor_inquiries to authenticated;

-- Enable RLS on every public table
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_registrations enable row level security;
alter table public.event_tracks enable row level security;
alter table public.sessions enable row level security;
alter table public.saved_sessions enable row level security;
alter table public.session_checkins enable row level security;
alter table public.abstracts enable row level security;
alter table public.abstract_reviews enable row level security;
alter table public.stream_stages enable row level security;
alter table public.live_qa_questions enable row level security;
alter table public.live_qa_upvotes enable row level security;
alter table public.live_polls enable row level security;
alter table public.live_poll_votes enable row level security;
alter table public.event_documents enable row level security;
alter table public.gamification_quests enable row level security;
alter table public.quest_completions enable row level security;
alter table public.direct_messages enable row level security;
alter table public.sponsor_booths enable row level security;
alter table public.sponsor_leads enable row level security;
alter table public.sponsor_inquiries enable row level security;

-- PROFILES policies
create policy "profiles_select_self_or_organizer" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id or private.is_platform_organizer());

create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "profiles_insert_self" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

-- EVENTS policies
create policy "events_public_read" on public.events
  for select to anon, authenticated
  using (is_published = true or private.is_platform_organizer());

create policy "events_organizer_write" on public.events
  for all to authenticated
  using (private.is_platform_organizer())
  with check (private.is_platform_organizer());

-- EVENT REGISTRATIONS policies
create policy "reg_select_own_or_org" on public.event_registrations
  for select to authenticated
  using ((select auth.uid()) = user_id or private.is_event_organizer(event_id));

create policy "reg_insert_own" on public.event_registrations
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "reg_update_own_or_org" on public.event_registrations
  for update to authenticated
  using ((select auth.uid()) = user_id or private.is_event_organizer(event_id))
  with check ((select auth.uid()) = user_id or private.is_event_organizer(event_id));

-- TRACKS, SESSIONS, STAGES, POLLS, QUESTS, BOOTHS (Public read, Organizer manage)
create policy "tracks_public_read" on public.event_tracks
  for select to anon, authenticated using (true);
create policy "tracks_org_manage" on public.event_tracks
  for all to authenticated
  using (private.is_event_organizer(event_id))
  with check (private.is_event_organizer(event_id));

create policy "sessions_public_read" on public.sessions
  for select to anon, authenticated
  using (is_published = true or private.is_event_organizer(event_id));
create policy "sessions_org_manage" on public.sessions
  for all to authenticated
  using (private.is_event_organizer(event_id))
  with check (private.is_event_organizer(event_id));

create policy "saved_sessions_own" on public.saved_sessions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "session_checkins_own_or_org" on public.session_checkins
  for select to authenticated
  using ((select auth.uid()) = user_id or private.is_event_organizer(event_id));
create policy "session_checkins_insert_own" on public.session_checkins
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "session_checkins_update_own" on public.session_checkins
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ABSTRACTS policies (Author sees own; Reviewers & Organizers see all for event)
create policy "abstracts_select_authorized" on public.abstracts
  for select to authenticated
  using ((select auth.uid()) = author_id or private.is_event_reviewer(event_id));

create policy "abstracts_insert_author" on public.abstracts
  for insert to authenticated
  with check ((select auth.uid()) = author_id);

create policy "abstracts_update_author_or_org" on public.abstracts
  for update to authenticated
  using ((select auth.uid()) = author_id or private.is_event_organizer(event_id))
  with check ((select auth.uid()) = author_id or private.is_event_organizer(event_id));

-- ABSTRACT REVIEWS policies (Reviewers/Organizers manage; Authors can read non-COI reviews for their own abstracts)
create policy "reviews_select_authorized" on public.abstract_reviews
  for select to authenticated
  using (
    (select auth.uid()) = reviewer_id
    or private.is_event_organizer(event_id)
    or exists (
      select 1 from public.abstracts a
      where a.id = abstract_id and a.author_id = (select auth.uid())
    )
  );

create policy "reviews_insert_reviewer" on public.abstract_reviews
  for insert to authenticated
  with check ((select auth.uid()) = reviewer_id and private.is_event_reviewer(event_id));

create policy "reviews_update_own_reviewer" on public.abstract_reviews
  for update to authenticated
  using ((select auth.uid()) = reviewer_id or private.is_event_organizer(event_id))
  with check ((select auth.uid()) = reviewer_id or private.is_event_organizer(event_id));

-- STREAM STAGES, Q&A, POLLS
create policy "stages_public_read" on public.stream_stages
  for select to anon, authenticated using (true);
create policy "stages_org_manage" on public.stream_stages
  for all to authenticated
  using (private.is_event_organizer(event_id))
  with check (private.is_event_organizer(event_id));

create policy "qa_public_read" on public.live_qa_questions
  for select to anon, authenticated using (true);
create policy "qa_auth_insert" on public.live_qa_questions
  for insert to authenticated
  with check ((select auth.uid()) = author_id);
create policy "qa_org_update" on public.live_qa_questions
  for update to authenticated
  using (private.is_event_organizer(event_id))
  with check (private.is_event_organizer(event_id));

create policy "qa_upvotes_read" on public.live_qa_upvotes
  for select to authenticated using (true);
create policy "qa_upvotes_own" on public.live_qa_upvotes
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "qa_upvotes_delete_own" on public.live_qa_upvotes
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "polls_public_read" on public.live_polls
  for select to anon, authenticated using (true);
create policy "polls_org_manage" on public.live_polls
  for all to authenticated
  using (private.is_event_organizer(event_id))
  with check (private.is_event_organizer(event_id));

create policy "poll_votes_public_read" on public.live_poll_votes
  for select to anon, authenticated using (true);
create policy "poll_votes_insert_own" on public.live_poll_votes
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- EVENT DOCUMENTS
create policy "docs_public_read" on public.event_documents
  for select to anon, authenticated
  using (is_public = true or (select auth.uid()) = uploaded_by or private.is_event_organizer(event_id));
create policy "docs_auth_insert" on public.event_documents
  for insert to authenticated
  with check ((select auth.uid()) = uploaded_by);
create policy "docs_org_or_owner_delete" on public.event_documents
  for delete to authenticated
  using ((select auth.uid()) = uploaded_by or private.is_event_organizer(event_id));

-- GAMIFICATION QUESTS & COMPLETIONS
create policy "quests_public_read" on public.gamification_quests
  for select to anon, authenticated using (is_active = true or private.is_event_organizer(event_id));
create policy "quests_org_manage" on public.gamification_quests
  for all to authenticated
  using (private.is_event_organizer(event_id))
  with check (private.is_event_organizer(event_id));

create policy "quest_completions_own_or_org" on public.quest_completions
  for select to authenticated
  using ((select auth.uid()) = user_id or private.is_event_organizer(event_id));

-- DIRECT MESSAGES (Sender or Recipient only)
create policy "dm_select_participants" on public.direct_messages
  for select to authenticated
  using ((select auth.uid()) = sender_id or (select auth.uid()) = recipient_id);
create policy "dm_insert_sender" on public.direct_messages
  for insert to authenticated
  with check ((select auth.uid()) = sender_id);
create policy "dm_update_recipient_read" on public.direct_messages
  for update to authenticated
  using ((select auth.uid()) = recipient_id)
  with check ((select auth.uid()) = recipient_id);

-- SPONSORS, LEADS & INQUIRIES
create policy "booths_public_read" on public.sponsor_booths
  for select to anon, authenticated using (is_published = true or private.is_event_organizer(event_id));
create policy "booths_org_manage" on public.sponsor_booths
  for all to authenticated
  using (private.is_event_organizer(event_id))
  with check (private.is_event_organizer(event_id));

create policy "leads_own_or_org" on public.sponsor_leads
  for select to authenticated
  using ((select auth.uid()) = user_id or private.is_event_organizer(event_id));
create policy "leads_insert_own" on public.sponsor_leads
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "inquiries_insert_any" on public.sponsor_inquiries
  for insert to anon, authenticated with check (true);
create policy "inquiries_org_select" on public.sponsor_inquiries
  for select to authenticated
  using (private.is_event_organizer(event_id) or (select auth.uid()) = submitted_by);
create policy "inquiries_org_update" on public.sponsor_inquiries
  for update to authenticated
  using (private.is_event_organizer(event_id))
  with check (private.is_event_organizer(event_id));

-- -----------------------------------------------------------------------------
-- 14. SUPABASE STORAGE BUCKETS & UPSERT-SAFE POLICIES
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('event-public', 'event-public', true, 52428800, array[
    'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip'
  ]),
  ('event-submissions', 'event-submissions', false, 52428800, array[
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip'
  ])
on conflict (id) do nothing;

-- Public bucket: anyone can view; authenticated users can upload/upsert inside their own UID folder
create policy "storage_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'event-public');

create policy "storage_public_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'event-public' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "storage_public_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'event-public' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'event-public' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Private submissions bucket: owner (UID folder) + platform organizers can read/upload/upsert
create policy "storage_sub_select_own_or_org" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'event-submissions'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or private.is_platform_organizer()
    )
  );

create policy "storage_sub_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'event-submissions' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "storage_sub_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'event-submissions' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'event-submissions' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- -----------------------------------------------------------------------------
-- 15. SUPABASE REALTIME PUBLICATION
-- -----------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.live_qa_questions;
  alter publication supabase_realtime add table public.live_poll_votes;
  alter publication supabase_realtime add table public.quest_completions;
  alter publication supabase_realtime add table public.sessions;
  alter publication supabase_realtime add table public.direct_messages;
exception when duplicate_object then
  null;
end $$;
