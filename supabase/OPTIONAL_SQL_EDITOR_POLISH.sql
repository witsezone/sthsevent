-- =============================================================================
-- OPTIONAL SQL EDITOR POLISH (Run manually in Supabase SQL Editor if desired)
-- 1. Defense-in-depth RLS on private.quest_answer_keys (not exposed to Data API;
--    public.submit_quest_answer runs as SECURITY DEFINER so quests keep working)
-- 2. Eliminates all 7 multiple_permissive_policies performance warnings by
--    splitting FOR ALL organizer policies into explicit INSERT / UPDATE / DELETE
-- =============================================================================

-- A. Optional defense-in-depth RLS on private.quest_answer_keys
ALTER TABLE "private"."quest_answer_keys" ENABLE ROW LEVEL SECURITY;

-- B. Split the 7 FOR ALL organizer policies into INSERT / UPDATE / DELETE
DROP POLICY IF EXISTS "events_organizer_write" ON public.events;
CREATE POLICY "events_organizer_insert" ON public.events FOR INSERT TO authenticated WITH CHECK (private.is_platform_organizer());
CREATE POLICY "events_organizer_update" ON public.events FOR UPDATE TO authenticated USING (private.is_platform_organizer()) WITH CHECK (private.is_platform_organizer());
CREATE POLICY "events_organizer_delete" ON public.events FOR DELETE TO authenticated USING (private.is_platform_organizer());

DROP POLICY IF EXISTS "tracks_org_manage" ON public.event_tracks;
CREATE POLICY "tracks_org_insert" ON public.event_tracks FOR INSERT TO authenticated WITH CHECK (private.is_event_organizer(event_id));
CREATE POLICY "tracks_org_update" ON public.event_tracks FOR UPDATE TO authenticated USING (private.is_event_organizer(event_id)) WITH CHECK (private.is_event_organizer(event_id));
CREATE POLICY "tracks_org_delete" ON public.event_tracks FOR DELETE TO authenticated USING (private.is_event_organizer(event_id));

DROP POLICY IF EXISTS "sessions_org_manage" ON public.sessions;
CREATE POLICY "sessions_org_insert" ON public.sessions FOR INSERT TO authenticated WITH CHECK (private.is_event_organizer(event_id));
CREATE POLICY "sessions_org_update" ON public.sessions FOR UPDATE TO authenticated USING (private.is_event_organizer(event_id)) WITH CHECK (private.is_event_organizer(event_id));
CREATE POLICY "sessions_org_delete" ON public.sessions FOR DELETE TO authenticated USING (private.is_event_organizer(event_id));

DROP POLICY IF EXISTS "stages_org_manage" ON public.stream_stages;
CREATE POLICY "stages_org_insert" ON public.stream_stages FOR INSERT TO authenticated WITH CHECK (private.is_event_organizer(event_id));
CREATE POLICY "stages_org_update" ON public.stream_stages FOR UPDATE TO authenticated USING (private.is_event_organizer(event_id)) WITH CHECK (private.is_event_organizer(event_id));
CREATE POLICY "stages_org_delete" ON public.stream_stages FOR DELETE TO authenticated USING (private.is_event_organizer(event_id));

DROP POLICY IF EXISTS "polls_org_manage" ON public.live_polls;
CREATE POLICY "polls_org_insert" ON public.live_polls FOR INSERT TO authenticated WITH CHECK (private.is_event_moderator(event_id));
CREATE POLICY "polls_org_update" ON public.live_polls FOR UPDATE TO authenticated USING (private.is_event_moderator(event_id)) WITH CHECK (private.is_event_moderator(event_id));
CREATE POLICY "polls_org_delete" ON public.live_polls FOR DELETE TO authenticated USING (private.is_event_moderator(event_id));

DROP POLICY IF EXISTS "quests_org_manage" ON public.gamification_quests;
CREATE POLICY "quests_org_insert" ON public.gamification_quests FOR INSERT TO authenticated WITH CHECK (private.is_event_organizer(event_id));
CREATE POLICY "quests_org_update" ON public.gamification_quests FOR UPDATE TO authenticated USING (private.is_event_organizer(event_id)) WITH CHECK (private.is_event_organizer(event_id));
CREATE POLICY "quests_org_delete" ON public.gamification_quests FOR DELETE TO authenticated USING (private.is_event_organizer(event_id));

DROP POLICY IF EXISTS "booths_org_manage" ON public.sponsor_booths;
CREATE POLICY "booths_org_insert" ON public.sponsor_booths FOR INSERT TO authenticated WITH CHECK (private.is_event_organizer(event_id));
CREATE POLICY "booths_org_or_owner_update" ON public.sponsor_booths FOR UPDATE TO authenticated
  USING (private.is_event_organizer(event_id) OR ((select auth.uid()) = owner_user_id AND private.is_event_sponsor(event_id)))
  WITH CHECK (private.is_event_organizer(event_id) OR ((select auth.uid()) = owner_user_id AND private.is_event_sponsor(event_id)));
CREATE POLICY "booths_org_delete" ON public.sponsor_booths FOR DELETE TO authenticated USING (private.is_event_organizer(event_id));
