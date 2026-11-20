-- =============================================================================
-- STHS EventHub — Clean Production Seed (ZERO fake users, abstracts, or speakers)
-- Seeds official Wits School of Therapeutic Sciences events catalog and
-- official GO Game-On! Symposium 2027 structure (tracks, stages, quests, booths).
-- =============================================================================

-- 1. Official Wits School of Therapeutic Sciences Events Catalog
insert into public.events (
  slug, title, short_title, tagline, description, department, host_unit,
  venue, start_date, end_date, date_label, format, status, site_path,
  subdomain_hint, accent_color, contact_email, contact_phone, is_featured, is_published
) values
(
  'game-on-symposium-2027',
  'GO Game-On! Symposium 2027',
  'Game-On! 2027',
  'Playing Our Stories: Educational, Digital & Traditional Games for Learning, Teaching and Community',
  'Flagship hybrid academic symposium celebrating educational board games, African indigenous games (Morabaraba, Mancala/Oware, Diketo), clinical escape rooms, XR simulation, AI virtual patients, and inter-university playful pedagogy partnerships.',
  'eFundanathi eZone & Cross-School',
  'Wits University · Faculty of Health Sciences · School of Therapeutic Sciences & eFundanathi eZone',
  'eFundanathi eZone, Wits Education Campus (Parktown) & Online',
  '2027-03-11',
  '2027-03-12',
  '11–12 March 2027',
  'Hybrid (In-Person + Zoom & MS Teams)',
  'registration_open',
  './game-on-symposium-2027/',
  'gameon2027.sthsevent.wits.ac.za',
  '#17787e',
  'help.efundanathi@wits.ac.za',
  '+27 11 717 3259',
  true,
  true
),
(
  'sths-biennial-research-day-2027',
  'STHS Biennial Research Day 2027',
  'STHS Research Day',
  'Advancing Resilient Health Systems & Interprofessional Clinical Research in Africa',
  'The School of Therapeutic Sciences flagship biennial showcase bringing together postgraduate researchers, clinicians, NRF-rated scientists, and community health partners across Nursing Education, Occupational Therapy, Pharmacy & Pharmacology, Physiotherapy, and Exercise Science & Sports Medicine.',
  'All 5 STHS Departments',
  'Wits School of Therapeutic Sciences Research Committee',
  'Wits Education Campus & Faculty of Health Sciences Auditorium, Parktown',
  '2027-08-26',
  '2027-08-27',
  '26–27 August 2027',
  'Hybrid (In-Person + MS Teams)',
  'upcoming',
  '#event-sths-biennial-research-day-2027',
  'researchday2027.sthsevent.wits.ac.za',
  '#007377',
  'efundanathi.ezone@wits.ac.za',
  '+27 11 717 3259',
  false,
  true
),
(
  'health-sciences-innovation-fair-2027',
  'Wits Health Sciences Innovation Fair & Clinical Tech Showcase',
  'Health Innovation Fair',
  'From Bench, Clinic & BioHub to Community Health Impact',
  'Cross-disciplinary innovation showcase highlighting Wits Advanced Drug Delivery Platform (WADDP), CENTRIC nanopharmaceutical research, clinical XR simulations, and translational therapeutic devices.',
  'Pharmacy & Pharmacology · BioHub',
  'Faculty of Health Sciences & School of Therapeutic Sciences',
  'Wits Health Sciences BioHub, Parktown & Zoom',
  '2027-05-20',
  '2027-05-20',
  '20 May 2027',
  'Hybrid (In-Person + Zoom)',
  'upcoming',
  '#event-health-sciences-innovation-fair-2027',
  'innovation2027.sthsevent.wits.ac.za',
  '#003B5C',
  'efundanathi.ezone@wits.ac.za',
  '+27 11 717 1000',
  false,
  true
),
(
  'ipe-clinical-simulation-colloquium-2027',
  'Interprofessional Education (IPE) & Clinical Simulation Colloquium',
  'IPE & Clinical Sim',
  'Collaborative Patient-Centred Training Across Therapeutic Professions',
  'Joint academic colloquium led by Nursing Education, Physiotherapy, and Occupational Therapy exploring multidisciplinary student wards, clinical simulation labs, and patient safety education.',
  'Nursing Education · Physiotherapy · Occupational Therapy',
  'Wits School of Therapeutic Sciences IPE Working Group',
  'Parktown Health Sciences Campus & MS Teams',
  '2027-06-17',
  '2027-06-18',
  '17–18 June 2027',
  'Hybrid (In-Person + MS Teams)',
  'upcoming',
  '#event-ipe-clinical-simulation-colloquium-2027',
  'ipe2027.sthsevent.wits.ac.za',
  '#006d72',
  'efundanathi.ezone@wits.ac.za',
  '+27 11 717 1000',
  false,
  true
),
(
  'essm-activity-advocates-summit-2027',
  'ESSM Activity Advocates & Sports Medicine Summit',
  'Activity Advocates Summit',
  'Exercise Is Medicine: Prescribing Physical Activity for Health & Recovery',
  'Hosted by the Department of Exercise Science and Sports Medicine (ESSM) & Wits Sports Clinic — uniting sports physicians, biokineticists, oncology exercise researchers, and South Africa''s Activity Advocates network.',
  'Exercise Science & Sports Medicine (ESSM)',
  'Department of Exercise Science & Sports Medicine · Wits Sports Clinic',
  'Wits Education Campus & Brian & Dorothy Zylstra Sports Complex',
  '2027-09-16',
  '2027-09-17',
  '16–17 September 2027',
  'Hybrid (In-Person + Zoom)',
  'upcoming',
  '#event-essm-activity-advocates-summit-2027',
  'essm2027.sthsevent.wits.ac.za',
  '#C59627',
  'efundanathi.ezone@wits.ac.za',
  '+27 11 717 1000',
  false,
  true
)
on conflict (slug) do update set
  title = excluded.title,
  tagline = excluded.tagline,
  description = excluded.description,
  date_label = excluded.date_label,
  status = excluded.status,
  updated_at = now();

-- 2. Official GO Game-On! Symposium 2027 Tracks, Stages, Quests, Booths & Initial Poll
do $$
declare
  v_event_id uuid;
  v_q1 uuid;
  v_q2 uuid;
  v_q3 uuid;
  v_q4 uuid;
  v_q5 uuid;
  v_s1 uuid;
  v_s2 uuid;
  v_s3 uuid;
  v_s4 uuid;
  v_s5 uuid;
  v_stage_a uuid;
begin
  select id into v_event_id from public.events where slug = 'game-on-symposium-2027';

  -- Official Tracks 1-4 (Directly from official Call for Abstracts p2.ai)
  insert into public.event_tracks (event_id, track_code, title, subtitle, topics, drive_folder_path, color_token, sort_order)
  values
    (v_event_id, 'TRACK 1', 'Educational Games and Playful Pedagogies',
     'Exploring the design and use of games to enhance teaching, learning, and assessment.',
     array['Digital game-based learning','Gamification','Serious games','Educational game design','Escape rooms and tabletop games','Playful learning approaches','Curriculum innovation through play','Assessment through games'],
     '/EventHub_GameOn_2027/01_Abstracts/Track_1_Playful_Pedagogies/', 'mustard', 1),
    (v_event_id, 'TRACK 2', 'Simulation, Immersive Technologies and AI',
     'Emerging technologies that create authentic, engaging, and transformative learning experiences.',
     array['Simulation-based education','Virtual, augmented and mixed reality','Virtual patients and digital twins','Minecraft and virtual worlds','Artificial intelligence in education','Learning analytics','Adaptive learning systems','Human-AI collaboration'],
     '/EventHub_GameOn_2027/01_Abstracts/Track_2_Simulation_XR_AI/', 'teal', 2),
    (v_event_id, 'TRACK 3', 'Games, Health and Society',
     'Examining how games support learning, wellbeing, culture, and social impact within communities and professional practice.',
     array['Health professions education','Healthcare simulations','Patient safety education','Clinical decision-making','Community engagement','Indigenous and traditional knowledge systems','Equity, inclusion and accessibility','Games for social impact'],
     '/EventHub_GameOn_2027/01_Abstracts/Track_3_Games_Health_Society/', 'terracotta', 3),
    (v_event_id, 'TRACK 4', 'Research, Innovation and Partnerships',
     'Advancing evidence, scholarship, and collaboration in educational gaming.',
     array['Game-based learning research','Design-based research','Evaluation and assessment','Learning sciences','Impact studies','Emerging scholar research','Industry-academic partnerships','Educational innovation and entrepreneurship','Communities of practice'],
     '/EventHub_GameOn_2027/01_Abstracts/Track_4_Research_Partnerships/', 'navy', 4)
  on conflict (event_id, track_code) do update set
    title = excluded.title,
    subtitle = excluded.subtitle,
    topics = excluded.topics;

  -- Official Hybrid Live Stream Stages (Organizers update join_url & embed_url when links are issued)
  insert into public.stream_stages (event_id, stage_code, name, platform, status_label, is_live, current_session_title, current_speaker, room_location, sort_order)
  values
    (v_event_id, 'stage-a', 'Stage A · eFundanathi eZone Main Auditorium', 'Zoom', 'READY · 11–12 MAR 2027', false,
     'Plenary Keynotes, Track 1 & Closing Awards', 'Confirmed keynote speakers published via Programme Manager', 'eFundanathi eZone Main Auditorium, Wits Education Campus', 1),
    (v_event_id, 'stage-b', 'Stage B · Therapeutic Sciences XR & Simulation Lab', 'MS Teams', 'HYBRID BREAKOUT ROOM', false,
     'Track 2 & Track 3: Clinical Simulations, XR, AI & Health Games', 'Session stream activates during live programme', 'Therapeutic Sciences Simulation Pod, Parktown', 2),
    (v_event_id, 'stage-c', 'Stage C · Tabletop & Indigenous Games Playtest Commons', 'Zoom', 'INTERACTIVE EXPO STREAM', false,
     'Live Tabletop Playtesting, Morabaraba & Digital Game Demos', 'Overhead playtest camera + Zoom breakout tables', 'eFundanathi eZone Commons', 3)
  on conflict (event_id, stage_code) do nothing;

  select id into v_stage_a from public.stream_stages where event_id = v_event_id and stage_code = 'stage-a';

  -- Initial Live Audience Poll (Zero fake votes — real votes come from signed-in delegates)
  if not exists (select 1 from public.live_polls where event_id = v_event_id) then
    insert into public.live_polls (event_id, stage_id, question, options, is_active)
    values (
      v_event_id,
      v_stage_a,
      'Which game-based learning modality are you most excited to explore at GO Game-On! 2027?',
      '["Indigenous & Tabletop Board Games","Clinical VR, Digital Twins & AI Virtual Patients","Physical & Digital Escape Rooms","Design-Based Research & Industry Partnerships"]'::jsonb,
      true
    );
  end if;

  -- Pre-built Amazing Race (5 Checkpoints) & Scavenger Hunt (5 Quests) — ready for launch!
  if not exists (select 1 from public.gamification_quests where event_id = v_event_id) then
    insert into public.gamification_quests (event_id, quest_type, sort_order, title, category, location, mode, points, clue, hint)
    values (v_event_id, 'amazing_race', 1, 'The Morabaraba Mill Strategist', 'Amazing Race · Leg 1', 'eFundanathi eZone Commons (Board Station 1)', 'In-Person & Online Riddle', 150,
            'In traditional Southern African Morabaraba, how many ''cows'' (dikgomo) does each player begin with during the Placing Phase before forming three-in-a-row mills?',
            'Think of the number of months in a year — or the second date of our March 2027 symposium!')
    returning id into v_q1;

    insert into public.gamification_quests (event_id, quest_type, sort_order, title, category, location, mode, points, clue, hint)
    values (v_event_id, 'amazing_race', 2, 'Therapeutic Triage Escape Lock', 'Amazing Race · Leg 2', 'Wits School of Therapeutic Sciences · Sim Pod B', 'Hybrid Team Puzzle', 200,
            'Our host hub at Wits Education Campus is named ''eFundanathi eZone''. What three-word English phrase does ''Fundanathi'' translate to on our official host badge?',
            'Look underneath the Fundanathi emblem on the official Game-On! Symposium 2027 Save-the-Date poster.')
    returning id into v_q2;

    insert into public.gamification_quests (event_id, quest_type, sort_order, title, category, location, mode, points, clue, hint)
    values (v_event_id, 'amazing_race', 3, 'Mancala / Oware Seed-Sowing Cipher', 'Amazing Race · Leg 3', 'Wits Education Campus Heritage Courtyard', 'Physical Board + Mobile Code', 200,
            'Which numbered Game-On! Symposium Track covers ''Simulation, Immersive Technologies and AI'' (Virtual Patients, Digital Twins & Minecraft)? Enter the track number (1, 2, 3, or 4).',
            'Inspect the teal Track card on the Overview tab or Page 2 of the Call for Abstracts.')
    returning id into v_q3;

    insert into public.gamification_quests (event_id, quest_type, sort_order, title, category, location, mode, points, clue, hint)
    values (v_event_id, 'amazing_race', 4, 'VR Digital Twin Diagnostic Portal', 'Amazing Race · Leg 4', 'eZone XR Lab & MS Teams Breakout', 'Hybrid Co-Op', 250,
            'Complete the official 2027 Symposium Theme: ''Playing Our Stories: Educational, _______ and Traditional Games for Learning, Teaching and Community.''',
            'Starts with D — the counterpart to physical & traditional games!')
    returning id into v_q4;

    insert into public.gamification_quests (event_id, quest_type, sort_order, title, category, location, mode, points, clue, hint)
    values (v_event_id, 'amazing_race', 5, 'Cross-University Pit Stop & Final Vault', 'Amazing Race · Leg 5', 'eFundanathi eZone Main Stage', 'Squad Finale', 300,
            'Enter the official 6-character finale code displayed at the eZone Main Stage & Virtual Lobby (GAME27) to seal your finish!',
            'Type GAME27 to complete the final Amazing Race pit stop.')
    returning id into v_q5;

    -- Scavenger Hunt Quests (QR / Passport Codes)
    insert into public.gamification_quests (event_id, quest_type, sort_order, title, category, location, mode, points, clue, hint)
    values (v_event_id, 'scavenger_hunt', 1, 'Check-in at eFundanathi eZone Welcome Desk (or Virtual Lobby)', 'Campus / Virtual Check-In', 'eZone Foyer & Online Lobby', 'QR / Code', 100,
            'Scan the welcome QR code at registration or enter the venue check-in code announced at opening.', 'Code format: WITSEZONE')
    returning id into v_s1;

    insert into public.gamification_quests (event_id, quest_type, sort_order, title, category, location, mode, points, clue, hint)
    values (v_event_id, 'scavenger_hunt', 2, 'Playtest an Indigenous African Board Game (Morabaraba / Mancala)', 'Playtest Expo', 'Playtest Commons', 'QR / Code', 150,
            'Play a round at the Traditional Games table or join the online Playtest Commons to unlock this stamp.', 'Ask the Playtest table host for the Morabaraba code.')
    returning id into v_s2;

    insert into public.gamification_quests (event_id, quest_type, sort_order, title, category, location, mode, points, clue, hint)
    values (v_event_id, 'scavenger_hunt', 3, 'Connect with Delegates from Another University', 'Inter-University Networking', 'Networking Directory', 'QR / Code', 150,
            'Exchange a networking message with a peer from another institution and redeem the Ubuntu Network code.', 'Shared at the Inter-University Mixer.')
    returning id into v_s3;

    insert into public.gamification_quests (event_id, quest_type, sort_order, title, category, location, mode, points, clue, hint)
    values (v_event_id, 'scavenger_hunt', 4, 'Visit Exhibitor & Partner Innovation Booths', 'Sponsor Passport', 'Exhibitor Hall & Sponsors Tab', 'QR / Code', 120,
            'Explore our Sponsors & Partners showcase and scan the Exhibitor Passport QR code.', 'Available in the Sponsors & Exhibitors tab.')
    returning id into v_s4;

    insert into public.gamification_quests (event_id, quest_type, sort_order, title, category, location, mode, points, clue, hint)
    values (v_event_id, 'scavenger_hunt', 5, 'Academic Engagement Stamp (Abstract or Live Q&A)', 'Academic Engagement', 'Live Stage Q&A', 'QR / Code', 130,
            'Participate in Live Q&A or submit an abstract and redeem the Plenary Engagement code.', 'Announced by the session chair during plenaries.')
    returning id into v_s5;

    -- Store accepted answers securely in private schema (never exposed via PostgREST)
    insert into private.quest_answer_keys (quest_id, accepted_answers) values
      (v_q1, array['12', 'twelve', '12 cows']),
      (v_q2, array['learn with us', 'learnwithus']),
      (v_q3, array['2', 'track 2', 'two']),
      (v_q4, array['digital', 'digital games']),
      (v_q5, array['game27', 'gameon', 'gameon27']),
      (v_s1, array['witsezone']),
      (v_s2, array['morabaraba27']),
      (v_s3, array['ubuntunetwork']),
      (v_s4, array['partner2027']),
      (v_s5, array['playourstories']);
  end if;

  -- Confirmed Official Host & Supporting Partner Booths (Real institutional partners only)
  if not exists (select 1 from public.sponsor_booths where event_id = v_event_id) then
    insert into public.sponsor_booths (event_id, name, tier, category, logo_text, description, website_url, contact_email, scavenger_code, sort_order)
    values
      (v_event_id, 'Wits School of Therapeutic Sciences & eFundanathi eZone', 'Official Host', 'University Innovation Hub',
       'WITS · eFundanathi eZone', 'Blended learning, clinical simulation, and educational gaming hub in the Faculty of Health Sciences at Wits Education Campus.',
       'https://www.wits.ac.za/therapeuticsciences/', 'help.efundanathi@wits.ac.za', 'WITSEZONE', 1),
      (v_event_id, 'ZAG — ZA Game-based Learning Association', 'Supporting Partner', 'Academic Association',
       'ZAG · Game-Based Learning SA', 'Advancing national collaboration, scholarship, and communities of practice in game-based learning across South Africa.',
       '', 'help.efundanathi@wits.ac.za', 'PARTNER2027', 2),
      (v_event_id, 'DiGRA South Africa', 'Supporting Partner', 'Research Community',
       'DiGRA South Africa', 'Digital Games Research Association South Africa chapter supporting critical game studies, playful pedagogy, and African game research.',
       '', 'help.efundanathi@wits.ac.za', 'PARTNER2027', 3);
  end if;
end $$;
