# Lab Partner App: Phase 1 build plan

Status: **draft, awaiting approval**. No app code is written until this plan is approved.
Source of truth for scope: [BUILD_PROMPT.md](BUILD_PROMPT.md).

## 1. Stack

Versions match MyClinicSoft (`clinic-management`) so the two codebases feel the same to work in.

| Piece | Choice | Version |
| --- | --- | --- |
| Runtime | Node.js | 24 (installed: 24.22.1) |
| Package manager | pnpm | 10.33.0 (`packageManager` pinned) |
| Framework | Next.js App Router, Turbopack | 16.4.1 |
| UI | React | 19.2.0 |
| Language | TypeScript, `strict: true` | 5.x |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss`, `@theme inline`) | 4.x |
| Database | MongoDB + Mongoose | Mongoose 8.24 |
| Validation | zod | 4.x |
| Password hashing | bcryptjs | 3.x |
| Two-factor (TOTP) | otplib | 13.x |
| Icons | lucide-react, `strokeWidth={1.75}` | 0.563 |
| Barcodes | jsbarcode (Code 128, rendered to SVG for printing) | latest stable |
| Tests | vitest + mongodb-memory-server | vitest 5.x |
| Lint | ESLint 9 flat config + eslint-config-next 16.4.1 (`next lint` no longer exists; run `eslint .`) | |

Next.js 16 points the plan relies on (from the bundled docs):

- **`proxy.ts`**, not `middleware.ts`. It's used only for optimistic redirects (no session cookie → `/login`) and security headers. Real authorization happens in every route and server action.
- **Request APIs are async:** `await cookies()`, `await headers()`, `await params`.
- **`after()`** runs post-response work. Webhook sends are kicked off this way after release (see §6).
- `next build` uses Turbopack by default.

## 2. Folder layout

```
lab-partner-app/
  app/
    (auth)/login/            sign-in, TOTP step, first-time TOTP enrolment
    (app)/                   signed-in shell: sidebar + header
      page.tsx               today: inbox counts, overdue, failed deliveries
      orders/                inbox (FR-1, FR-3), order record page
      check-in/              scan or search an order, match patient (FR-4)
      specimens/             collect, label print, reject/recollect (FR-5, FR-6)
      worklists/[section]/   per-section worklists (FR-9)
      results/[orderId]/     entry (FR-10, FR-12), validation (FR-13, FR-14), amend (FR-16)
      reports/[resultId]/    printable A4 report (FR-17)
      admin/                 lab profile, users, catalog + mappings, clinics + keys (FR-7, FR-8, FR-19)
    v1/orders/route.ts       inbound MyClinicSoft orders (contract §1)
    v1/health/route.ts
    verify/[serial]/page.tsx public report check (no values shown)
    api/jobs/deliveries/route.ts  cron-triggered retry runner (CRON_SECRET)
    icon.tsx, apple-icon.tsx, opengraph-image.tsx   brand mark
    layout.tsx, globals.css
  components/
    BrandLogo.tsx            copied unchanged from MyClinicSoft
    shell/                   Sidebar, Header, Breadcrumb, UserMenu
    ui/                      Button, Badge, Panel, Field, AlertDialog, StatusLine, Skeleton, Pager
  lib/
    brand-mark.ts            copied unchanged from MyClinicSoft
    brand.ts                 product name constant ("MyClinicSoft" / "Lab")
    db.ts                    cached Mongoose connection
    auth/                    sessions, passwords, totp, roles, guards
    crypto.ts                AES-256-GCM encrypt/decrypt, API-key hashing
    orders/                  intake, idempotency, state machine
    catalog/                 reference-range lookup, flagging
    results/                 versioning, release rules, amendments
    delivery/                payload builder, signer, sender, retry schedule
    audit.ts
    rate-limit.ts            Mongo fixed-window counter per clinic
    time.ts                  UTC storage, Asia/Manila display, PH date format
  models/                    one file per collection (§4)
  scripts/
    mock-clinic/             fake MyClinicSoft: sends orders, verifies webhooks
    seed.ts                  lab, admin user, sample catalog (marked as sample data)
    db-indexes.ts            sync indexes
    privacy-export.ts, privacy-delete.ts
  __tests__/                 unit + route tests (vitest)
  proxy.ts
  docs/  PLAN.md  DECISIONS.md  BUILD_PROMPT.md
```

## 3. Design tokens (set up before any screen)

From MyClinicSoft's `DESIGN.md` and `app/globals.css`. This is a summary; the copied files are the source.

- `app/layout.tsx`: Geist and Geist_Mono from `next/font/google` as `--font-geist-sans` / `--font-geist-mono`, `display: "swap"`.
- `app/globals.css`: the `:root` tokens below, plus an `@theme inline` block mapping them to Tailwind (`bg-brand-teal-dark`, `font-mono`, …).
  - Ground and ink: `--background #f8fafc`, `--foreground #0f172a`
  - Teal: `--brand-teal #0ea5a4`, `--brand-teal-dark #0a7f7e`, `--brand-teal-deep #086362`, `--brand-teal-light #e3f6f5`
  - Other brand: `--brand-blue #2563eb`, `--brand-navy #0b2136`
  - Charts and states: `--chart-teal #0e9594`, `--chart-ochre #b45309`, `--state-pending #d97706`, `--state-critical #be123c`
  - The gray-50 to gray-900 scale
  - `::selection` in teal-light with navy text
- Shared UI primitives are built first and used everywhere, so the rules live in one place:
  - Button: primary teal-dark, secondary, ghost, destructive
  - Badge: the status map from the prompt
  - Panel with 8px corners and a hairline border
  - Field with a teal focus ring
  - Mono figure
  - Status line
  - AlertDialog
- A `/dev/brand` page, shown in development only, renders every primitive and badge, so the look can be checked at a glance.

## 4. Data model

Every collection carries `labId` (one lab in v1, multi-lab later). Times are stored in UTC.

| Model | Key fields | Indexes |
| --- | --- | --- |
| `Lab` | name, licenceNo, address, reportHeader | — |
| `User` | labId, name, email, passwordHash, totpSecretEnc, totpEnabled, roles[], licenceNo, active, failedLogins, lockedUntil | `{labId, email}` unique |
| `Session` | userId, tokenHash, createdAt, lastSeenAt, expiresAt, ip, userAgent | `tokenHash` unique; TTL on `expiresAt` |
| `ConnectedClinic` | labId, name, mcsLabCode, platformHost, apiKeys[{hash, prefix, expiresAt}], apiSecretHash, webhookSecretEnc, active | `apiKeys.prefix`; `{labId, name}` |
| `TestDefinition` | labId, code, loinc, name, section, specimenType, turnaroundHours, analytes[{key, name, unit, ranges[{sex, ageMinDays, ageMaxDays, low, high, text}], criticalLow, criticalHigh}], active, sample | `{labId, code}` unique |
| `TestMapping` | labId, clinicId, clinicTestType, clinicTestCode, testId | `{clinicId, clinicTestCode}`, `{clinicId, clinicTestType}` |
| `Order` | labId, requestId, clinicId, requestCode, urgency, patient{…snapshot}, test{type, code, testId}, clinicalInfo, instructions, extras (orderCode, tests[], clinicName, orderingDoctor when sent), status, statusHistory[], rejectReason, receivedAt, rawPayload | `{clinicId, requestCode}` unique; `requestId` unique; `{labId, status, urgency, receivedAt}` |
| `Specimen` | labId, orderId, accessionNo, container, collectedBy, collectedAt, condition, rejectedReason, recollectOf | `accessionNo` unique; `orderId` |
| `Result` | labId, orderId, version, values[{key, value, unit, flag}], interpretation, attachments[], enteredBy, enteredAt, releasedBy, releasedAt, supersededBy, amendReason, criticalCall{calledBy, takenBy, at}, reportSerial | `{orderId, version}` unique; `reportSerial` unique |
| `Delivery` | labId, resultId, orderId, resultIdString (`<accession>-v<n>`), attempts, lastStatus, lastError, nextAttemptAt, deliveredAt, flagged, flagReason | `{deliveredAt, flagged, nextAttemptAt}`; `resultId` unique |
| `RateWindow` | key (`clinicId:minute`), count | `key` unique; TTL 2 min |
| `AuditEvent` | labId, userId, action, entity, entityId, before, after, ip, at | `{labId, at}`, `{entity, entityId}`; append-only, with no update or delete path in code |

Attachments are stored in GridFS behind a `FileStore` interface (put, get, delete), so moving to S3-compatible storage later is a one-file change.

## 5. Routes

**Contract (machine-facing)**

- `POST /v1/orders`:
  1. Authenticate: look up the key prefix, then bcrypt-compare the whole key. Check `X-API-Secret` when the clinic has one.
  2. Rate limit (60 per minute) and validate with zod. Unknown fields pass through into `extras` or `rawPayload`.
  3. Map the test. Unmapped tests get `422 UNKNOWN_TEST`.
  4. Upsert on `{clinicId, requestCode}`. New orders return `201`; repeats return `200`.
  5. Return `{requestId, status}`.

  No slow work happens in the request.
- `GET /v1/health` returns `{ok: true}`.
- `GET /verify/[serial]` is a public page showing lab, date, test names and status. It is rate-limited and never shows values.
- `POST /api/jobs/deliveries` runs due deliveries. It needs `Authorization: Bearer CRON_SECRET`.

**People-facing pages:** as in the layout above. Mutations are server actions, and each one:

- checks the session and role
- validates input with zod
- checks the state transition through `lib/orders/state.ts`
- writes an audit event
- returns a status-line message

## 6. Key mechanisms

- **Order state machine** (`lib/orders/state.ts`). A table of allowed transitions:
  - `received` → `accepted` or `rejected`
  - `accepted` → `collected`
  - `collected` → `in-progress`
  - `in-progress` → `awaiting-validation`
  - `awaiting-validation` → `released`
  - `released` → `delivered`
  - `released` or `delivered` → `awaiting-validation` (an amendment)

  It's one function, `transition(order, to, actor)`, and every caller goes through it. Tests cover every pair.
- **Flagging** (`lib/catalog/flags.ts`). The reference range is picked by sex and age in days at collection. `criticalLow` and `criticalHigh` give C, outside the range gives H or L, otherwise the value is normal. On the wire, C is sent as `high` or `low`, and `interpretation` gets "Critical: hb 5.1 g/dL".
- **Release rules.**
  - The releaser must hold the signatory role, must not be the person who entered the values (`enteredBy`), and must have a licence number.
  - Any C flag needs a `criticalCall` record first.
  - Release sets `reportSerial`, writes the `Delivery` row, and kicks off the send with `after()`.
- **Delivery.**
  1. Build the body, then serialise it once. Those exact bytes are signed and sent.
  2. Sign with HMAC-SHA256 over `"<ts>.<body>"`.
  3. POST over HTTPS to the clinic's `platformHost` with `redirect: "manual"` and a 15 s timeout.
  4. Handle the reply:
     - `200`: delivered.
     - `400`, `401`, `404`, `409`: flagged. A `401` tells staff to check the clock and the secret.
     - `503`, other `5xx`, timeout or network error: retry at 1, 5, 15 and 60 minutes, then hourly until 24 h, then flag.

  The cron route and `after()` both call the same `runDueDeliveries()`. A row is claimed with an atomic `findOneAndUpdate`, so two runners never send the same attempt.
- **Amendments.** Create version n+1 holding the reason, and point the old version's `supersededBy` at it. The order goes back to `awaiting-validation`. On release, version n+1 is delivered with `resultId` `<accession>-v<n+1>`.
- **Auth.**
  - Email and password, checked with bcrypt at cost 12.
  - TOTP is required, and enrolled on first sign-in with a QR code.
  - A random 32-byte session token goes in an `httpOnly`, `Secure`, `SameSite=Lax` cookie. Only its SHA-256 is stored.
  - Sessions last 12 h, or 30 min idle, refreshed on activity.
  - The account locks for 15 min after 5 failed attempts.
  - Server actions already check the origin. Custom POST routes for people check the `Origin` header.
- **Secrets.**
  - Webhook secrets and TOTP secrets are encrypted with AES-256-GCM using `APP_ENCRYPTION_KEY` (32 bytes, base64).
  - API keys look like `lpk_<8-char prefix>_<32 random>`. They're stored as bcrypt hashes and shown once.
  - During a rotation, the old key stays valid for 7 days.
- **Security headers** are set in `proxy.ts` and `next.config.ts` headers: CSP with a nonce, HSTS, `frame-ancestors 'none'`, `Referrer-Policy`, and `X-Content-Type-Options`.
- **Live lists.** The inbox and worklists poll a server action every 30 s, only while `document.visibilityState === "visible"`. They show "Updated 9:41 AM" and keep the last good data if a poll fails.

## 7. Mock clinic (`scripts/mock-clinic/`)

A small Node HTTP server, `pnpm mock:clinic`, listening on `127.0.0.1:4010`.

- `POST /api/lab-results/third-party/webhook` verifies the timestamp window and the signature with the same rules as MyClinicSoft. It logs the result and answers `200`. It can be switched to fail with `MOCK_FAIL=500` or `MOCK_FAIL=401`.
- `pnpm mock:order [--stat] [--test CBC]` sends a sample order to `http://localhost:3000/v1/orders` with the dev API key from the seed.
- For local development only, the app allows `http://127.0.0.1:4010` as a platform host when `NODE_ENV !== "production"`. Production requires `https`.

## 8. Environment

`.env.example`:

```
MONGODB_URI=mongodb://127.0.0.1:27017/lab_partner
APP_ENCRYPTION_KEY=           # 32 bytes, base64
SESSION_COOKIE_NAME=lp_session
CRON_SECRET=
APP_URL=http://localhost:3000
```

## 9. Build order (Phase 1)

**Status (2026-11-16): all 17 steps built.** `pnpm check` passes (122 unit tests); every e2e script passes, including `pnpm e2e:full` for the "done means" checklist.

Each step ends with `pnpm typecheck && pnpm lint && pnpm test` passing.

1. **Scaffold:** Next.js, TypeScript, Tailwind v4, ESLint, vitest, `.env.example`, `db.ts`, the brand files copied, fonts, tokens, UI primitives, and the `/dev/brand` page.
2. **Auth and users:** models, password + TOTP sign-in, sessions, `proxy.ts`, role guards, lockout, the audit log, and a seed script with the first admin.
3. **App shell:** sidebar, header, breadcrumb, user menu, drawer, and an empty Today page.
4. **Admin: lab profile, users and roles** (FR-19, part one).
5. **Connected clinics and keys:** create, show once, rotate with overlap, encrypted webhook secret (FR-19, part two).
6. **Test catalog and mappings:** CRUD, range editor, sample seed of CBC, urinalysis, fasting blood sugar, lipid profile and creatinine, marked as sample data (FR-7, FR-8).
7. **Order intake:** `POST /v1/orders` with idempotency, rate limit and errors, plus `/v1/health`. Route tests run against an in-memory Mongo (contract §1).
8. **Mock clinic:** the order sender and the webhook receiver.
9. **Inbox:** the list grouped by clinic and urgency, the order record page, and accept or reject with a reason (FR-1, FR-3).
10. **Check-in and specimens:** patient match, ID type, accession numbers, Code 128 labels, reject and recollect (FR-4 to FR-6).
11. **Worklists** with overdue highlighting (FR-9).
12. **Result entry:** values, automatic flags and attachments (FR-10, FR-12).
13. **Validation and release:** the four-eyes rule and the critical-call record (FR-13, FR-14).
14. **Delivery:** signer, sender, retry runner, cron route, and delivery status on the order (FR-15).
15. **Amendments** (FR-16).
16. **Report and verification page** (FR-17).
17. **Privacy scripts and README;** final end-to-end run of the "done means" checklist against the mock clinic.

## 10. Decisions I'll record in DECISIONS.md (defaults; tell me if you disagree)

1. **Tests use `mongodb-memory-server`.** Local development uses a Docker Mongo, as MyClinicSoft does.
2. **Deliveries run without Redis.** They run from `after()` on release, plus a cron route every minute in production. On Vercel that's Vercel Cron; on your own server it's a system cron that calls the route.
3. **Sessions are the app's own**, stored in Mongo with no auth library, for full control of TOTP, lockout and audit.
4. **Barcodes are generated in the browser** (jsbarcode SVG) and printed through a label print view sized for 50 × 25 mm labels.
5. **Accession numbers** use the format `YYMMDD-NNNN`, with a per-day counter in a Mongo `counters` collection.
6. **The report serial** is 12 random characters (Crockford base32) shown as `XXXX-XXXX-XXXX`.

## 11. Open questions (from the prompt, still yours to answer)

- Product name and domain. The placeholder wordmark is "MyClinicSoft" over "Lab".
- Single-lab deployment or multi-lab SaaS. I build single-lab, with `labId` on every collection.
- DOH retention period, and whether reports must print a DOH licence number.
- The pilot lab and its common tests. Until then the five sample tests are seeded and marked as sample data.
- **New:** where this will be hosted (Vercel or your own server). It only changes how the delivery cron is triggered.
