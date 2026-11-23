# Wits Email (`efundanathi@wits.ac.za`) & Payment Activation Guide

Your database (`ryabexxorzpsuvdfxzyo`) is now pre-loaded with official **Wits FNB Banking Details** (`UNIVERSITY OF THE WITWATERSRAND`, `PUBLIC SECTOR MANAGED ACCOUNT`, Acc `62150130426`, Branch `251905`, SWIFT `FIRNZAJJ`, dynamic delegate reference `GBLsymp_<Surname>`) and **4 live Edge Functions**:
- `send-sths-email` — White-labeled Registration Confirmation & Official PAID Tax Invoice emails from `efundanathi@wits.ac.za`
- `sths-password-reset` — White-labeled Forgot Password emails from `efundanathi@wits.ac.za` (100% outside Supabase Auth's 2/hour limit!)
- `payfast-checkout` & `payfast-itn` — Ready on standby (hidden from delegates until you enable PayFast in Organizer Admin)

---

## Step 1: Turn OFF Supabase Built-In Confirm Email (Zero Rate Limits on Free Tier)
1. Open https://supabase.com/dashboard/project/ryabexxorzpsuvdfxzyo/auth/providers
2. Expand **Email**, toggle **Confirm email** → **OFF**, and click **Save**.
   *(Now `Register` sends 0 Supabase Auth emails — unlimited delegates can register simultaneously while `send-sths-email` sends the branded welcome/registration email from `efundanathi@wits.ac.za`!)*

---

## Step 2: Set Your 5 Edge Function Email Secrets (Zero Supabase Branding)
Open **Edge Functions → Secrets**: https://supabase.com/dashboard/project/ryabexxorzpsuvdfxzyo/functions/secrets and add:

### Option A — Wits Microsoft 365 SMTP (Direct from `efundanathi@wits.ac.za`)
- `SMTP_HOST` = `smtp.office365.com`
- `SMTP_PORT` = `587`
- `SMTP_USER` = `efundanathi@wits.ac.za`
- `SMTP_PASS` = *(Wits SMTP AUTH password for `efundanathi@wits.ac.za` — ask Wits CNS/IT to enable Authenticated SMTP on the mailbox)*
- `SMTP_FROM` = `efundanathi@wits.ac.za`

### Option B — Free Transactional Relay (Brevo 300/day or Resend 3,000/month)
- If Wits CNS blocks direct Microsoft 365 SMTP AUTH, create a free **Resend** or **Brevo** account and either:
  - Set `RESEND_API_KEY` + `SMTP_FROM` = `efundanathi@wits.ac.za` (once Wits IT adds Resend's 2–3 SPF/DKIM DNS records), **OR**
  - Set Brevo's SMTP credentials (`SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`).

Because BOTH **`send-sths-email`** and **`sths-password-reset`** read these exact 5 secrets, **100% of Registration Confirmations, Paid Tax Invoices, and Forgot Password emails** send directly from `efundanathi@wits.ac.za` with **zero Supabase branding** and **zero Free-Tier email rate limits**!

---

## Step 3: Optional — PayFast Activation (Only If Confirmed with Wits Finance)
PayFast is **currently hidden from delegates** (delegates see only the 2 secure Wits options: **Direct/Institutional FNB Bank EFT (`GBLsymp_<Surname>`) + Proof of Payment Upload** and **University Purchase Order + PO Upload**).

If Wits Finance later approves PayFast:
1. Add `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`, and `PAYFAST_SANDBOX` (`true` for testing / `false` for live ZAR) in **Edge Functions → Secrets**.
2. Sign in as `spha.msimang@wits.ac.za` → **🛠️ Admin → Billing Settings** → tick **Enable PayFast Online Checkout** and click **Save**.
