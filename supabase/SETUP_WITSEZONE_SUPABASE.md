# Connecting STHS EventHub to the `witsezone` GitHub Supabase Account

This repository is production-ready for **Supabase Auth, PostgreSQL (with RLS), Storage, and Realtime** under your **`witsezone` GitHub-linked Supabase account**.

## 1. Create the Supabase Project (under `witsezone` GitHub login)
1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard) and sign in with your **`witsezone` (`witsezone-star`) GitHub account**.
2. Create a new project named **`sths-eventhub`** in region **`eu-west-2`** (London) or **`eu-central-1`** (Frankfurt) — Free Tier (\$0/mo).
3. Wait ~2 minutes until the project status is **Active**.

## 2. Run the Production Database Migration & Clean Seed
Open **SQL Editor** in your new `sths-eventhub` Supabase Dashboard and run these two files in order:
1. [`supabase/migrations/0001_sths_eventhub_schema.sql`](migrations/0001_sths_eventhub_schema.sql) — creates all 20 tables, RLS policies, private anti-cheat & role-guard functions, Storage buckets (`event-public`, `event-submissions`), and Realtime subscriptions.
2. [`supabase/seed_sths_events.sql`](seed_sths_events.sql) — seeds the official Wits School of Therapeutic Sciences events catalog, GO Game-On! Symposium 2027 tracks, hybrid stages, Amazing Race & Scavenger Hunt quests, and confirmed institutional hosts (zero fake demo users).

## 3. Configure Authentication (Email + Magic Link + Sign in with GitHub)
1. In **Authentication → URL Configuration**:
   - **Site URL:** `https://witsezone.github.io/sthsevent/` (or `https://witsezone-star.github.io/sthsevent/` before username rename)
   - **Redirect URLs** (add all of these):
     - `https://witsezone.github.io/sthsevent/**`
     - `https://witsezone-star.github.io/sthsevent/**`
     - `http://localhost:8080/**`
2. In **Authentication → Providers → Email**: ensure **Email** and **Confirm email** (or Magic Link OTP) are enabled.
3. In **Authentication → Providers → GitHub**:
   - Copy the **Callback URL** shown in Supabase (`https://<your-project-ref>.supabase.co/auth/v1/callback`).
   - In GitHub (**Settings → Developer settings → OAuth Apps → New OAuth App** under `witsezone`), set:
     - **Homepage URL:** `https://witsezone.github.io/sthsevent/`
     - **Authorization callback URL:** `https://<your-project-ref>.supabase.co/auth/v1/callback`
   - Paste the **Client ID** and **Client Secret** into Supabase and toggle **GitHub Enabled**.

## 4. Add Your Project URL & Publishable Key
In **Project Settings → API Keys**, copy:
- **Project URL** (`https://<project-ref>.supabase.co`)
- **Publishable Key** (`sb_publishable_...` or legacy `anon` public key — **never** the `service_role` secret key!)

Paste them into `js/supabase-config.js` (or hand them to Antigravity to commit & push):
```js
window.STHS_SUPABASE_CONFIG = {
  url: "https://<your-project-ref>.supabase.co",
  publishableKey: "sb_publishable_..."
};
```

## 5. Promote Your First Super Admin (`wits.ezone@gmail.com`)
Sign up once on the live website with your organizer email or GitHub account, then run this single SQL line in Supabase SQL Editor:
```sql
update public.profiles
set platform_role = 'super_admin'
where email = 'wits.ezone@gmail.com';
```
You immediately unlock the **STHS Event Studio** (create/edit school events) and **GO Game-On! 2027 Organizer Command Center** (sessions, speakers, live Zoom/Teams stream links, peer review decisions, CSV exports, and analytics).
