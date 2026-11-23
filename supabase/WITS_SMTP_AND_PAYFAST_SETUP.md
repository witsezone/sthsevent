# Wits Microsoft 365 SMTP (`efundanathi@wits.ac.za`) & PayFast Activation Guide

Your database (`0004_payments_invoices_and_billing`) and all 3 backend Edge Functions (`send-sths-email`, `payfast-checkout`, `payfast-itn`) are already live on **`ryabexxorzpsuvdfxzyo`**.

---

## 1. Send All Emails from `efundanathi@wits.ac.za` (Zero Supabase Branding)

### A. Supabase Auth Emails (Sign-up Confirmation & Forgot Password)
1. Open **SMTP Settings**: https://supabase.com/dashboard/project/ryabexxorzpsuvdfxzyo/auth/smtp
2. Toggle **Enable Custom SMTP** → **ON** and enter your Wits Microsoft 365 SMTP settings (request Authenticated SMTP AUTH / App Password from Wits CNS/IT for the `efundanathi@wits.ac.za` mailbox):
   - **Sender email:** `efundanathi@wits.ac.za`
   - **Sender name:** `Wits STHS EventHub · eFundanathi eZone`
   - **Host:** `smtp.office365.com`
   - **Port number:** `587`
   - **Username:** `efundanathi@wits.ac.za`
   - **Password:** *(Wits mailbox / SMTP AUTH password)*
   - Click **Save**.
3. Open **Email Templates**: https://supabase.com/dashboard/project/ryabexxorzpsuvdfxzyo/auth/templates
   - **Confirm signup:**
     - Subject: `Confirm Your Registration · GO Game-On! Symposium 2027`
     - Body: paste [`supabase/email-templates/confirm-signup.html`](email-templates/confirm-signup.html)
   - **Reset Password:**
     - Subject: `Reset Your Password · Wits STHS EventHub`
     - Body: paste [`supabase/email-templates/reset-password.html`](email-templates/reset-password.html)
   - Click **Save** on each.
4. Once Custom SMTP is saved, raise your hourly email cap at https://supabase.com/dashboard/project/ryabexxorzpsuvdfxzyo/auth/rate-limits and turn **Confirm email** ON at https://supabase.com/dashboard/project/ryabexxorzpsuvdfxzyo/auth/providers.

### B. Automated Registration Confirmation & Paid Tax Invoice Emails (`send-sths-email`)
Open **Edge Functions → Secrets**: https://supabase.com/dashboard/project/ryabexxorzpsuvdfxzyo/functions/secrets and add:
- `SMTP_HOST` = `smtp.office365.com`
- `SMTP_PORT` = `587`
- `SMTP_USER` = `efundanathi@wits.ac.za`
- `SMTP_PASS` = *(Wits SMTP AUTH password)*
- `SMTP_FROM` = `efundanathi@wits.ac.za`

*(Alternative: if Wits IT prefers Resend/Brevo instead of direct Office 365 SMTP, add `RESEND_API_KEY` + `SMTP_FROM=efundanathi@wits.ac.za` and `send-sths-email` uses it automatically.)*

---

## 2. Activate PayFast Online Checkout (SA Cards & Instant EFT)
1. Open **Edge Functions → Secrets**: https://supabase.com/dashboard/project/ryabexxorzpsuvdfxzyo/functions/secrets and add your PayFast Merchant credentials (from https://www.payfast.co.za/ or PayFast Sandbox):
   - `PAYFAST_MERCHANT_ID`
   - `PAYFAST_MERCHANT_KEY`
   - `PAYFAST_PASSPHRASE` *(recommended — must match PayFast Settings → Integration → Passphrase)*
   - `PAYFAST_SANDBOX` = `true` (for testing) or `false` (for live ZAR payments)
2. Sign in on https://witsezone.github.io/sthsevent/game-on-symposium-2027/ as **`spha.msimang@wits.ac.za`**, open **Organizer Admin → Finance & Invoices → Wits EFT Bank Details & PayFast Gateway Settings**:
   - Enter your official Wits Bank Account Number, Cost Centre Reference, and exact ZAR Ticket Fees.
   - Tick **Enable PayFast Online Checkout** (and untick Sandbox when ready for live card payments) and click **Save**.
3. PayFast automatically notifies `https://ryabexxorzpsuvdfxzyo.supabase.co/functions/v1/payfast-itn`, which cryptographically verifies the payment, marks the invoice **PAID**, and emails the official **PAID Tax Invoice & Receipt** from `efundanathi@wits.ac.za`.
