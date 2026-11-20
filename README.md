# STHS EventHub — Wits School of Therapeutic Sciences Hybrid Events Platform

Official multi-event hybrid conference, academic peer-review, and Progressive Web App (PWA) platform for the **University of the Witwatersrand (Wits) School of Therapeutic Sciences** & **eFundanathi eZone**.

- **Main School Hub URL:** `https://witsezone.github.io/sthsevent/` (active immediately under `witsezone-star.github.io/sthsevent/` prior to GitHub username rename)
- **Flagship Symposium URL:** `https://witsezone.github.io/sthsevent/game-on-symposium-2027/`

## Platform Architecture

1. **STHS EventHub Umbrella Portal (`/`)** — Editorial landing hub inspired by EventsAir and styled in official Wits School of Therapeutic Sciences brand colors (`#007377` Therapeutic Teal, `#003B5C` Wits Navy, `#C59627` Wits Ochre Gold). Showcases all major school events across Nursing Education, Occupational Therapy, Pharmacy & Pharmacology, Physiotherapy, Exercise Science & Sports Medicine (ESSM), and eFundanathi eZone.
2. **GO Game-On! Symposium 2027 (`/game-on-symposium-2027/`)** — Full device-adaptive PWA conference platform featuring:
   - **Supabase Authentication** (Email + Password, Magic Link OTP, Sign in with GitHub) & Digital QR Check-In Pass
   - **Personal Calendar Manager** (`.ICS` export, session bookmarks, live check-in, downloadable session handouts)
   - **Inter-University Speakers & Networking Directory** (bio & slide builder + 1-on-1 direct messaging)
   - **EasyChair-Grade Abstract Submission & Double-Blind Peer Review** (COI declarations, 4-criterion rubric, author rebuttals, 1-click agenda promotion)
   - **Hybrid Zoom & Microsoft Teams Live Stage** (multi-room switcher, Realtime Q&A upvotes, Realtime live polls)
   - **Wits Campus & Online Amazing Race + QR Scavenger Hunt** (server-verified XP & live University + Individual leaderboards)
   - **Interactive 3D 6-Page Sponsorship Prospectus Flipbook**, official packages, exhibitor lead capture & Organizer Command Center.
3. **Production Supabase Backend (`/supabase/`)**
   - [`supabase/migrations/0001_sths_eventhub_schema.sql`](supabase/migrations/0001_sths_eventhub_schema.sql)
   - [`supabase/seed_sths_events.sql`](supabase/seed_sths_events.sql)
   - [`supabase/SETUP_WITSEZONE_SUPABASE.md`](supabase/SETUP_WITSEZONE_SUPABASE.md)
