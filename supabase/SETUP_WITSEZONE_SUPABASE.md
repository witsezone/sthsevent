# Final Database Activation Guide (`ryabexxorzpsuvdfxzyo`)

Your website (`https://witsezone.github.io/sthsevent/` and `https://witsezone.github.io/sthsevent/game-on-symposium-2027/`) is now wired directly to your **`witsezone`** Supabase project (`https://ryabexxorzpsuvdfxzyo.supabase.co`).

## Step 1: Run the One-Click Database Setup SQL (30 seconds)
Because the publishable key (`sb_publishable_...`) is intentionally read/write-scoped for end users and cannot execute DDL (`CREATE TABLE`), run the schema once in your Supabase SQL Editor (open in regular Chrome or Safari):

1. Open: https://supabase.com/dashboard/project/ryabexxorzpsuvdfxzyo/sql/new
2. Copy the entire contents of [`supabase/RUN_ME_ALL_IN_ONE.sql`](RUN_ME_ALL_IN_ONE.sql) and click **Run**.
   *(It is 100% idempotent — safe to re-run anytime.)*

## Step 2: Configure Auth Redirect URLs & GitHub Sign-In
1. Open: https://supabase.com/dashboard/project/ryabexxorzpsuvdfxzyo/auth/url-configuration
   - **Site URL:** `https://witsezone.github.io/sthsevent/`
   - **Redirect URLs:**
     - `https://witsezone.github.io/sthsevent/**`
     - `https://witsezone.github.io/sthsevent/game-on-symposium-2027/**`
2. Open: https://supabase.com/dashboard/project/ryabexxorzpsuvdfxzyo/auth/providers
   - Ensure **Email** is enabled.
   - Under **GitHub**, copy the Callback URL (`https://ryabexxorzpsuvdfxzyo.supabase.co/auth/v1/callback`), create a GitHub OAuth App under `witsezone` (**GitHub → Settings → Developer settings → OAuth Apps**), and paste the Client ID & Secret back into Supabase.

## Step 3: Sign In as Primary Super Admin
Sign up or sign in on `https://witsezone.github.io/sthsevent/game-on-symposium-2027/` using **`spha.msimang@wits.ac.za`**.
The database trigger automatically grants **`spha.msimang@wits.ac.za`** full **Super Admin** access immediately — unlocking the **User Access & Role Approvals** backend to approve Planning Committee members, Peer Reviewers, Sponsors, Session Chairs, Volunteers, and additional Super Admins.
