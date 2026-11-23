-- =============================================================================
-- STHS EventHub — Migration 0003: Additional Mutation Guards & Function Revokes
-- Applied to Supabase project ryabexxorzpsuvdfxzyo (sths-eventhub)
-- =============================================================================

-- 1. Revoke anon/public execution on get_my_abstract_feedback (authenticated only)
revoke all on function public.get_my_abstract_feedback(uuid) from public, anon;
grant execute on function public.get_my_abstract_feedback(uuid) to authenticated;

-- 2. Prevent recipient from modifying message content/metadata on direct_messages (is_read only)
create or replace function private.guard_dm_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;
  new.event_id := old.event_id;
  new.sender_id := old.sender_id;
  new.recipient_id := old.recipient_id;
  new.message_text := old.message_text;
  new.created_at := old.created_at;
  return new;
end;
$$;

create or replace trigger trg_guard_dm_update
  before update on public.direct_messages
  for each row execute function private.guard_dm_update();

-- 3. Restrict sponsor_booths INSERT/DELETE strictly to event organizers
create or replace function private.guard_booth_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid := coalesce(new.event_id, old.event_id);
begin
  if current_user in ('postgres', 'service_role') then
    return coalesce(new, old);
  end if;

  if not private.is_event_organizer(v_event_id) then
    if tg_op = 'INSERT' then
      raise exception 'Only approved Planning Committee or Super Admin organizers can create sponsor booths.';
    elsif tg_op = 'DELETE' then
      raise exception 'Only approved Planning Committee or Super Admin organizers can delete sponsor booths.';
    elsif tg_op = 'UPDATE' then
      new.owner_user_id := old.owner_user_id;
      new.tier := old.tier;
      new.event_id := old.event_id;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create or replace trigger trg_guard_booth_mutation
  before insert or update or delete on public.sponsor_booths
  for each row execute function private.guard_booth_mutation();

-- 4. Update admin_update_user_access to check authoritative auth.users.email
create or replace function public.admin_update_user_access(
  p_target_user_id uuid,
  p_event_id uuid,
  p_new_event_role text,
  p_new_platform_role text default null,
  p_approval_status text default 'approved',
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_actor_is_super boolean := private.is_super_admin();
  v_actor_is_comm boolean := (p_event_id is not null and private.is_event_organizer(p_event_id)) or private.is_platform_organizer();
  v_target_prof record;
  v_target_auth_email text;
  v_old_ev_role text := '';
  v_final_plat text;
  v_final_ev text;
begin
  if v_actor is null or not (v_actor_is_super or v_actor_is_comm) then
    return jsonb_build_object('ok', false, 'error', 'Only approved Super Admins or Planning Committee members can manage access.');
  end if;

  select * into v_target_prof from public.profiles where id = p_target_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'User profile not found.');
  end if;

  select u.email into v_target_auth_email from auth.users u where u.id = p_target_user_id;

  if lower(trim(coalesce(v_target_auth_email, v_target_prof.email))) = 'spha.msimang@wits.ac.za'
     and (coalesce(p_new_platform_role, 'super_admin') <> 'super_admin' or p_new_event_role <> 'super_admin') then
    return jsonb_build_object('ok', false, 'error', 'Primary Super Admin (spha.msimang@wits.ac.za) cannot be demoted.');
  end if;

  if not v_actor_is_super then
    if v_target_prof.platform_role = 'super_admin' then
      return jsonb_build_object('ok', false, 'error', 'Only a Super Admin can modify another Super Admin account.');
    end if;
    if p_new_event_role in ('super_admin', 'planning_committee') or coalesce(p_new_platform_role, '') in ('super_admin', 'planning_committee') then
      return jsonb_build_object('ok', false, 'error', 'Only a Super Admin can grant Super Admin or Planning Committee access.');
    end if;
  end if;

  v_final_ev := case when p_approval_status = 'declined' then 'delegate' else p_new_event_role end;
  v_final_plat := coalesce(
    nullif(p_new_platform_role, ''),
    case
      when v_final_ev = 'super_admin' then 'super_admin'
      when v_final_ev = 'planning_committee' then 'planning_committee'
      else v_target_prof.platform_role
    end
  );
  if p_approval_status = 'declined' and v_target_prof.platform_role = 'member' then
    v_final_plat := 'member';
  end if;

  select role into v_old_ev_role from public.event_registrations where event_id = p_event_id and user_id = p_target_user_id;

  perform set_config('app.sths_rbac_bypass', 'on', true);

  update public.profiles
  set platform_role = v_final_plat,
      requested_platform_role = '',
      approval_status = case when p_approval_status = 'declined' then 'approved' else p_approval_status end,
      updated_at = now()
  where id = p_target_user_id;

  if p_event_id is not null then
    insert into public.event_registrations (event_id, user_id, role, requested_role, approval_status, approval_note, approved_by, approved_at)
    values (p_event_id, p_target_user_id, v_final_ev, '', p_approval_status, coalesce(p_note, ''), v_actor, now())
    on conflict (event_id, user_id) do update
      set role = v_final_ev,
          requested_role = '',
          approval_status = p_approval_status,
          approval_note = coalesce(p_note, ''),
          approved_by = v_actor,
          approved_at = now(),
          updated_at = now();
  end if;

  insert into public.role_audit_log (
    event_id, actor_id, target_user_id, action,
    old_event_role, new_event_role, old_platform_role, new_platform_role, note
  ) values (
    p_event_id, v_actor, p_target_user_id, p_approval_status,
    coalesce(v_old_ev_role, ''), v_final_ev, v_target_prof.platform_role, v_final_plat, coalesce(p_note, '')
  );

  return jsonb_build_object('ok', true, 'event_role', v_final_ev, 'platform_role', v_final_plat, 'approval_status', p_approval_status);
end;
$$;
