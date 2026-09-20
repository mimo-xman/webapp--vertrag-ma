# Vertrag.ma

Next.js web application that sends automatic job applications to German companies : from Morocco.

**Services:** automatic applications (postulations) · professional dossier preparation (20 $) · diploma translation.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · MongoDB (Mongoose) · Cloudinary · GitHub Actions.

---

## Architecture

Single repository containing both the web application and the GitHub Actions workers:

```
├── src/                        # Next.js web application
│   ├── app/
│   │   ├── page.tsx            # Public home page
│   │   ├── (auth)/             # Login, register, 2FA, password reset…
│   │   ├── (app)/              # User space: dashboard, postulations, demandes, dossier, profile
│   │   ├── admin/              # Admin panel (11 pages)
│   │   └── api/                # ~45 API routes (auth, user, admin)
│   ├── models/                 # 10 Mongoose collections
│   ├── lib/                    # auth (JWT+2FA), pricing engine, cloudinary, mailer-core, i18n…
│   └── middleware.ts           # Route protection
├── workflow/                   # GitHub Actions workers (shared models)
│   ├── send-postulations.ts    # Daily sending (cron 06:00 UTC)
│   ├── re-execute-postulations.ts  # Manual relaunch of failed sends
│   └── check-postulations.ts   # Self re-trigger gate
└── .github/workflows/          # Workflow definitions
```

## Features

### Authentication (reused from CVAutoSender)
- JWT sessions (7 days, httpOnly cookies) + bcrypt (12 rounds)
- Email verification (Brevo) with 24h tokens : anti-spam accounts
- Full TOTP 2FA: setup with QR code, 8 backup codes, disable by email fallback
- Password reset (1h tokens), password change (invalidates existing sessions)
- Account deletion with email confirmation + **cascade** delete of all user data
- Deep email validation via `@el-zazo/email-verifier` (register + admin companies)
- In-memory rate limiting on all sensitive endpoints
- Middleware route protection + server-side role checks (`requireAuth` / `requireAdmin`)

### User space
- **Dashboard** : live stats, upcoming applications, dossier status
- **Postulations** : full history with status stamps (en attente / envoyée / échouée / à relancer)
- **Demandes** : dynamic order form: company count by category → total options (500, +500…) → per-day options (300, +100…) → **live price with free 300/day discount displayed strikethrough**; WhatsApp payment CTA after creation
- **Dossier** : upload own PDF (free, team-verified) or request creation (20 $, paid via WhatsApp); full request history; permanent delete with pending-postulations guard
- **Profile** : personal info, password change, full 2FA management, account deletion

### Admin panel (11 pages)
- Dashboard with global stats + audit feed
- Categories / Companies CRUD (email verified via `@el-zazo/email-verifier`)
- Users management: role transfer (user ↔ admin), cascade delete (self excluded)
- Postulations: full list, **manual creation with duplicate warning + force confirm**, **re-execute button** (failed → re_execute + triggers GitHub Actions workflow via API)
- Postulation demandes: **payment confirmation automatically generates all postulations** spread over days (X/day starting tomorrow)
- Dossier add requests: preview PDF, approve (activates user dossier) / reject with message
- Dossier creation requests: payment confirmation (+ ready date, translation price), final PDF upload → completed (link saved in demande AND user doc)
- Mail senders CRUD (Brevo API / SMTP) with usage stats + **test email popup**
- Settings: prices (100-total / 100-per-day / free amount / minimums / steps), dossier price, German email message, WhatsApp link
- Audit logs: all admin actions recorded, read-only

### Workflow workers (GitHub Actions)
- **send-postulations.yml** : daily cron (06:00 UTC), 3 parallel instances × 60 postulations, self re-trigger loop until the queue is drained
- **re-execute-postulations.yml** : manual only, launched from the admin panel
- Pipeline per postulation: user dossier (required) → company email (required) → mail sender with **min usage_count** (atomic `$inc` claim) → download PDF from Cloudinary → send fixed German message + attachment → status update
- **A failure marks échouée and continues** to the next postulation (per spec); the reason is admin-only visible

### Design - "Das Amt"
Official German registry aesthetic: paper (#F4F2EC), ink (#1A1D21), Behördenblau (#1E4475), stamp red/green, Archivo + IBM Plex Sans/Mono, rubber-stamp status badges, Aktenzeichen reference numbers (VT-P-2026-000123). Custom `alertApp()` / `confirmApp()` popups replace native `alert()`/`confirm()` everywhere. FR/EN bilingual (cookie-based i18n foundation, extensible).

---

## Setup

```bash
# 1. Install (needs GITHUB_TOKEN for @el-zazo packages - see .npmrc)
export GITHUB_TOKEN=ghp_…    # PAT with read:packages
bun install                   # or npm install

# 2. Configure
cp .env.local.example .env.local  # fill in values (all optional in dev preview)

# 3. Run
bun run dev
```

**Dev preview mode:** without `MONGODB_URI`, the app starts an in-memory MongoDB **seeded with demo data** (1,150 companies, demo accounts: `admin@vertrag.ma` / `user@vertrag.ma`, password `Demo1234!`). Cloudinary and Brevo gracefully degrade to console logs.

### Production environment

| Variable | Usage |
|---|---|
| `MONGODB_URI` + `DB_NAME` | Database (required) |
| `JWT_SECRET` | Session tokens (required) |
| `BREVO_API_KEY` + `BREVO_SENDER_EMAIL` | Transactional emails |
| `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` | Dossier PDF uploads |
| `NEXT_PUBLIC_APP_URL` | Links inside emails |
| `GITHUB_TOKEN` | `read:packages` : installs `@el-zazo/email-verifier` |
| `GITHUB_WORKFLOW_TOKEN` | `repo` : triggers re-execute workflow from admin |
| `GITHUB_WORKFLOW_REPO` | Repository for workflow triggers |

### GitHub Actions secrets (Settings → Secrets → Actions)

| Secret | Usage |
|---|---|
| `MONGO_URI` | Database connection for workers |
| `MONGO_DB_NAME` | Database name (`vertrag_ma`) |

The daily workflow runs automatically at 06:00 UTC. The re-execute workflow is triggered from **Admin → Postulations → Relancer**.

---

## Data model (10 collections)

| Collection | Key fields | Statuses |
|---|---|---|
| `users` | full_name, date_of_birth, email, password, role, dossier_pdf_link, 2FA fields | active (email-verified) |
| `categories` | name | · |
| `companies` | name, email (verified), categorie_ids | · |
| `postulations` | user_id, company_id, mail_sender_id, demande_id, scheduled_at, posted_at, failed_reason | en_attente · envoyee · echouee · re_execute |
| `postulationdemandes` | ref_number, user_id, categorie_ids, nmbr_total, nmbr_per_day, price, confirmed_at | en_attente · payed · canceled |
| `dossierdemandeforadds` | ref_number, user_id, dossier_pdf_link, message_on_failed | en_attente · confirmed · rejected |
| `dossierdemandeforcreates` | ref_number, user_id, price, traduction_price, payed_at, dossier_ready_at, completed_at | en_attente · payed · completed · canceled |
| `mailsenders` | name, type (api/smtp), api_key / smtp_config, usage counters | active |
| `settings` | prices, German email message, WhatsApp link | · |
| `auditlogs` | admin_id, action, entity_type, details | · |

All collections carry `createdAt` / `updatedAt`. Unique index `(user_id, company_id)` on postulations enforces the **lifetime one-application-per-company** rule.

---

## Pricing engine (`src/lib/pricing.ts`)

- `buildTotalOptions(companiesAvailable)` → 500, 1000, 1500… capped by availability (2,300 companies → max 2,000)
- `buildPerDayOptions(nmbrTotal)` → 300, 400, 500… capped by the chosen total
- `computePrice(total, perDay)` → e.g. min order: 5 $ (total) + ~~3 $~~ (free 300/day) = **5 $**
- All parameters (default 1 $/100, free amount, minimums, steps) configurable in Admin → Settings

## License

Private project · © Vertrag.ma
