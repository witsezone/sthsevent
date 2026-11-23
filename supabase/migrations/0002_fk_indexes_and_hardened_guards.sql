-- =============================================================================
-- STHS EventHub — Migration 0002: Foreign-Key Indexes & Hardened Security Guards
-- Applied to Supabase project ryabexxorzpsuvdfxzyo (sths-eventhub)
-- =============================================================================

-- 1. Harden identity & anti-escalation trigger functions
create or replace function private.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text;
  v_auth_email text;
  v_is_root boolean;
begin
  if current_user in ('postgres', 'service_role') or current_setting('app.sths_rbac_bypass', true) = 'on' then
    new.updated_at := now();
    return new;
  end if;

  select email into v_auth_email from auth.users where id = new.id;
  v_is_root := lower(trim(coalesce(v_auth_email, ''))) = 'spha.msimang@wits.ac.za';

  if tg_op = 'INSERT' then
    new.email := coalesce(v_auth_email, new.email, '');
    if v_is_root then
      new.platform_role := 'super_admin';
      new.requested_platform_role := '';
      new.approval_status := 'approved';
    else
      new.platform_role := 'member';
      if new.requested_platform_role in ('planning_committee', 'super_admin') then
        new.approval_status := 'pending';
      else
        new.requested_platform_role := '';
        new.approval_status := 'approved';
      end if;
    end if;
    new.updated_at := now();
    return new;
  end if;

  -- Lock email to authoritative auth.users record (prevents email-spoofing elevation)
  new.email := coalesce(v_auth_email, old.email);

  if v_is_root then
    if new.platform_role <> 'super_admin' then
      raise exception 'Primary Super Admin account (spha.msimang@wits.ac.za) cannot be demoted';
    end if;
    new.requested_platform_role := '';
    new.approval_status := 'approved';
    new.updated_at := now();
    return new;
  end if;

  select p.platform_role into v_caller_role
  from public.profiles p
  where p.id = (select auth.uid());

  if coalesce(v_caller_role, '') <> 'super_admin' then
    if new.platform_role is distinct from old.platform_role then
      raise exception 'Only an approved Super Admin can modify platform access levels';
    end if;

    if new.requested_platform_role is distinct from old.requested_platform_role
       and new.requested_platform_role in ('planning_committee', 'super_admin') then
      new.approval_status := 'pending';
    else
      new.approval_status := old.approval_status;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.guard_registration_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_email text;
  v_user_platform_role text;
  v_is_org boolean;
  v_privileged text[] := array['sponsor', 'volunteer', 'session_chair', 'reviewer', 'planning_committee', 'super_admin'];
begin
  if current_user in ('postgres', 'service_role') or current_setting('app.sths_rbac_bypass', true) = 'on' then
    new.updated_at := now();
    return new;
  end if;

  select u.email into v_user_email from auth.users u where u.id = new.user_id;
  select p.platform_role into v_user_platform_role from public.profiles p where p.id = new.user_id;

  if lower(trim(coalesce(v_user_email, ''))) = 'spha.msimang@wits.ac.za'
     or coalesce(v_user_platform_role, '') = 'super_admin' then
    new.role := 'super_admin';
    new.requested_role := '';
    new.approval_status := 'approved';
    new.updated_at := now();
    return new;
  end if;

  v_is_org := private.is_event_organizer(new.event_id);

  if tg_op = 'INSERT' then
    if not v_is_org then
      new.xp_points := 100;
      new.checked_in := false;
      new.checked_in_at := null;
      new.approved_by := null;
      new.approved_at := null;
      if new.role = any(v_privileged) then
        new.requested_role := new.role;
        new.role := 'delegate';
        new.approval_status := 'pending';
      elsif new.requested_role = any(v_privileged) then
        new.role := coalesce(nullif(new.role, ''), 'delegate');
        new.approval_status := 'pending';
      else
        new.approval_status := 'approved';
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if not v_is_org then
      new.xp_points := old.xp_points;
      new.badge_code := old.badge_code;
      new.checked_in := old.checked_in;
      new.checked_in_at := old.checked_in_at;
      new.approved_by := old.approved_by;
      new.approved_at := old.approved_at;

      if new.role is distinct from old.role and new.role = any(v_privileged) then
        new.requested_role := new.role;
        new.role := old.role;
        new.approval_status := 'pending';
      elsif new.requested_role is distinct from old.requested_role and new.requested_role = any(v_privileged) then
        new.approval_status := 'pending';
      else
        new.approval_status := old.approval_status;
      end if;
    end if;
    new.updated_at := now();
  end if;

  return new;
end;
$$;

create or replace function private.guard_abstract_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_org boolean;
begin
  if current_user in ('postgres', 'service_role') or current_setting('app.sths_rbac_bypass', true) = 'on' then
    new.updated_at := now();
    return new;
  end if;

  v_is_org := private.is_event_organizer(new.event_id);

  if not v_is_org then
    if tg_op = 'INSERT' then
      new.status := 'submitted';
      new.promoted_session_id := null;
    elsif tg_op = 'UPDATE' then
      new.promoted_session_id := old.promoted_session_id;
      if new.status is distinct from old.status then
        if not (old.status = 'revision_requested' and new.status = 'under_review') then
          raise exception 'Only approved Planning Committee or Super Admin organizers can change abstract review decisions.';
        end if;
      end if;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace trigger trg_guard_profile_role
  before insert or update on public.profiles
  for each row execute function private.guard_profile_role();

create or replace trigger trg_guard_abstract_mutation
  before insert or update on public.abstracts
  for each row execute function private.guard_abstract_mutation();

-- 2. Double-blind author feedback RPC
create or replace function public.get_my_abstract_feedback(p_event_id uuid)
returns table (
  abstract_id uuid,
  weighted_average numeric(3,2),
  recommendation text,
  author_feedback text,
  has_conflict_of_interest boolean,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    ar.abstract_id,
    ar.weighted_average,
    ar.recommendation,
    ar.author_feedback,
    ar.has_conflict_of_interest,
    ar.created_at
  from public.abstract_reviews ar
  join public.abstracts a on a.id = ar.abstract_id
  where a.event_id = p_event_id
    and a.author_id = (select auth.uid())
    and ar.has_conflict_of_interest = false
  order by ar.created_at asc;
$$;

-- 3. Fix anon 401 on 5 public tables (split anon vs authenticated SELECT policies)
alter policy "events_public_read" on public.events to authenticated using (is_published = true or private.is_platform_organizer());
create policy "events_anon_read" on public.events for select to anon using (is_published = true);

alter policy "sessions_public_read" on public.sessions to authenticated using (is_published = true or private.is_event_organizer(event_id));
create policy "sessions_anon_read" on public.sessions for select to anon using (is_published = true);

alter policy "docs_public_read" on public.event_documents to authenticated using (is_public = true or (select auth.uid()) = uploaded_by or private.is_event_organizer(event_id));
create policy "docs_anon_read" on public.event_documents for select to anon using (is_public = true);

alter policy "quests_public_read" on public.gamification_quests to authenticated using (is_active = true or private.is_event_organizer(event_id));
create policy "quests_anon_read" on public.gamification_quests for select to anon using (is_active = true);

alter policy "booths_public_read" on public.sponsor_booths to authenticated using (is_published = true or private.is_event_organizer(event_id) or (select auth.uid()) = owner_user_id);
create policy "booths_anon_read" on public.sponsor_booths for select to anon using (is_published = true);

-- 4. Tighten existing RLS policies
alter policy "qa_auth_insert" on public.live_qa_questions
  with check ((select auth.uid()) = author_id and upvote_count = 0 and is_answered = false);

alter policy "reviews_select_authorized" on public.abstract_reviews
  using ((select auth.uid()) = reviewer_id or private.is_event_organizer(event_id));

alter policy "reviews_update_own_reviewer" on public.abstract_reviews
  using (((select auth.uid()) = reviewer_id and private.is_event_reviewer(event_id)) or private.is_event_organizer(event_id))
  with check (((select auth.uid()) = reviewer_id and private.is_event_reviewer(event_id)) or private.is_event_organizer(event_id));

alter policy "dm_insert_sender" on public.direct_messages
  with check ((select auth.uid()) = sender_id and is_read = false);

alter policy "booths_org_manage" on public.sponsor_booths
  using (private.is_event_organizer(event_id) or ((select auth.uid()) = owner_user_id and private.is_event_sponsor(event_id)))
  with check (private.is_event_organizer(event_id) or ((select auth.uid()) = owner_user_id and private.is_event_sponsor(event_id)));

alter policy "inquiries_insert_any" on public.sponsor_inquiries
  to authenticated
  with check (
    (submitted_by is null or submitted_by = (select auth.uid()))
    and status = 'new'
    and char_length(trim(organization_name)) > 0
    and char_length(trim(work_email)) > 3
  );
create policy "inquiries_anon_insert" on public.sponsor_inquiries
  for insert to anon
  with check (
    submitted_by is null
    and status = 'new'
    and char_length(trim(organization_name)) > 0
    and char_length(trim(work_email)) > 3
  );

alter policy "storage_sub_select_own_or_org" on storage.objects
  using (
    bucket_id = 'event-submissions'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or private.is_platform_organizer()
      or exists (
        select 1 from public.abstracts a
        where a.abstract_file_url = name
          and private.is_event_reviewer(a.event_id)
      )
    )
  );

-- 5. Add all 24 missing covering foreign-key indexes
create index if not exists idx_abstract_reviews_event on public.abstract_reviews (event_id);
create index if not exists idx_abstracts_promoted_session on public.abstracts (promoted_session_id);
create index if not exists idx_direct_messages_event on public.direct_messages (event_id);
create index if not exists idx_event_documents_session on public.event_documents (session_id);
create index if not exists idx_event_documents_uploaded_by on public.event_documents (uploaded_by);
create index if not exists idx_event_registrations_approved_by on public.event_registrations (approved_by);
create index if not exists idx_events_created_by on public.events (created_by);
create index if not exists idx_live_poll_votes_event on public.live_poll_votes (event_id);
create index if not exists idx_live_poll_votes_user on public.live_poll_votes (user_id);
create index if not exists idx_live_polls_stage on public.live_polls (stage_id);
create index if not exists idx_live_qa_questions_author on public.live_qa_questions (author_id);
create index if not exists idx_live_qa_questions_event on public.live_qa_questions (event_id);
create index if not exists idx_live_qa_upvotes_user on public.live_qa_upvotes (user_id);
create index if not exists idx_quest_completions_event on public.quest_completions (event_id);
create index if not exists idx_role_audit_log_actor on public.role_audit_log (actor_id);
create index if not exists idx_role_audit_log_event on public.role_audit_log (event_id);
create index if not exists idx_role_audit_log_target_user on public.role_audit_log (target_user_id);
create index if not exists idx_saved_sessions_event on public.saved_sessions (event_id);
create index if not exists idx_session_checkins_event on public.session_checkins (event_id);
create index if not exists idx_sessions_created_by on public.sessions (created_by);
create index if not exists idx_sponsor_booths_owner on public.sponsor_booths (owner_user_id);
create index if not exists idx_sponsor_inquiries_submitted_by on public.sponsor_inquiries (submitted_by);
create index if not exists idx_sponsor_leads_event on public.sponsor_leads (event_id);
create index if not exists idx_sponsor_leads_user on public.sponsor_leads (user_id);
