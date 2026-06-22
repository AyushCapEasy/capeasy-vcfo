# Saral email module (`src/lib/email`)

Self-contained, swappable email layer for **Saral by CapEasy**, built on the **shared CapEasy Resend**
infrastructure. Designed to lift-and-shift, unchanged, into a future **single shared CapEasy notification
service** (one service, four products). Email only — WhatsApp/DoubleTick is **not** built here yet.

## Structure

| File | Role |
|---|---|
| `types.ts` | `EmailProvider` interface + `EmailMessage` / `SendResult`. The seam every caller depends on. |
| `config.ts` | Env-driven config (`EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_TOKEN`) + Saral identity (`SARAL_SENDER_NAME`, `formatSender`). No secrets in source. |
| `resend.ts` | `ResendProvider` — send-only, native `fetch` (no SDK), `POST https://api.resend.com/emails`. |
| `mock.ts` | `MockProvider` — records sends in-memory, never hits the network. The **test default**. |
| `templates.ts` | Saral-branded auth templates (verification, password reset). **Canonical source** of the Saral copy/branding. |
| `index.ts` | Public surface: `getEmailProvider()`, `sendVerificationEmail()`, `sendPasswordResetEmail()`. |
| `email.test.ts` | Mock-only tests: from-address, Saral framing, correct template, **zero live sends**. |

## Shared address, per-product framing

The from-**address** is the shared `noreply@capeasy.in` (one Resend-verified domain across all CapEasy
products). The display **name** is per-product: `Saral by CapEasy <noreply@capeasy.in>`. Subjects and
bodies all self-identify as Saral, so recipients always know which product mailed them.

## Provider selection (safe by default)

`EMAIL_PROVIDER=resend` → `ResendProvider` (requires `RESEND_API_TOKEN`, else it fails loud).
**Anything else — including unset or `mock` — resolves to `MockProvider`.** No environment can perform an
accidental live send; tests always run on mock.

## Supabase-fork decision — auth emails route via Supabase → Resend SMTP (NOT the app provider)

**Decision:** the signup **confirmation/verification** and **password-reset** emails are sent by
**Supabase Auth's native mailer pointed at Resend SMTP**, *not* through this app-level `ResendProvider`.

**Why (this is the cleaner route given our constraints):**

1. **Secrets surface / D-014 guardrail (decisive).** Sending these specific emails app-side requires
   `supabase.auth.admin.generateLink()`, which needs the **`service_role`** key at runtime. Our deploy
   guardrail keeps `service_role` **out of the cloud runtime** (script-only). The SMTP route keeps the
   verification/recovery token lifecycle entirely inside Supabase GoTrue — **no `service_role` in Vercel**.
2. **Security.** Supabase owns token generation, expiry, and single-use semantics. Relaying tokens through
   our own send path adds security-critical surface for no functional gain.
3. **Still originates from Resend.** SMTP host `smtp.resend.com` → all such mail flows through the shared
   CapEasy Resend account/domain, satisfying "all CapEasy email originates from Resend."
4. **Branding preserved.** The Saral-branded HTML in `templates.ts` is the canonical source, pasted into
   Supabase's email-template editor (with Supabase's `{{ .ConfirmationURL }}` action-link variable).

**What this module is for, then:** every *other* Saral email (now: ready; future: transactional
notifications), and the canonical home of the Saral auth-template copy. When the shared notification
service is built, this module lifts out unchanged and the auth emails remain a thin, replicable
per-product SMTP config.

**Alternative (only if you later accept `service_role` in that runtime):** disable Supabase auto-emails,
generate links via `generateLink`, and send through `ResendProvider`. Not adopted — blocked by D-014.

### Supabase dashboard config (set on the PROD project — you do this yourself)

> Configure when standing up prod. Safe to set now; **keep public signups DISABLED** until RLS
> GAP-1/GAP-2 land.

- **Authentication → Emails → SMTP Settings → Enable Custom SMTP:**
  - Sender email: `noreply@capeasy.in` (matches `EMAIL_FROM`; must be on the Resend-verified `capeasy.in` domain)
  - Sender name: `Saral by CapEasy`
  - Host: `smtp.resend.com`
  - Port: `465` (implicit TLS; Resend also supports `587` STARTTLS, `2465`, `2587`)
  - Username: `resend`
  - Password: the value of `RESEND_API_TOKEN` (Resend uses the API key as the SMTP password)
- **Authentication → Email Templates →** "Confirm signup" + "Reset password": paste the Saral HTML from
  `templates.ts`, keeping Supabase's action-link variables.
- **Authentication → URL Configuration →** Site URL = prod domain; add the confirm/reset redirect URLs.
- **Authentication → Providers → Email → "Allow new users to sign up": OFF** until GAP-1/GAP-2 land.

Custom SMTP also lifts Supabase's built-in email rate limit — another reason this is the right call for prod.
