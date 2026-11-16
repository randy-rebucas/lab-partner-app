# Decisions

Defaults chosen while building, newest last. Each can be revisited; the reason is kept so a change is deliberate.

| # | Date | Decision | Why |
| --- | --- | --- | --- |
| 1 | 2026-11-16 | Same stack and versions as MyClinicSoft (Next.js 16.4.1, React 19.2, Mongoose 8, zod 4, Tailwind 4, vitest, pnpm 10.33) | One way of working across both codebases |
| 2 | 2026-11-16 | Brand files (`lib/brand-mark.ts`, `components/BrandLogo.tsx`, icon routes) copied unchanged from MyClinicSoft; tokens copied into `app/globals.css` | The brand is fixed (MyClinicSoft PRODUCT.md "Brand Commitments") |
| 3 | 2026-11-16 | Product name kept in `lib/brand.ts` as "MyClinicSoft" / "Lab" | Final name is an open question; one place to change it |
| 4 | 2026-11-16 | Order transitions add four steps beyond the plan: accepted → rejected; collected/in-progress → accepted (specimen rejected, recollect); awaiting-validation → in-progress (signatory sends back) | Real lab flow needs to undo a step without leaving the state machine |
| 5 | 2026-11-16 | Own sessions in MongoDB (SHA-256 of a 32-byte token), no auth library | Full control of TOTP, lockout and the audit trail |
| 6 | 2026-11-16 | TOTP via otplib 13 with ±30 s tolerance; a code accepted once is refused for 90 s | Clock drift on phones; stops a code being replayed |
| 7 | 2026-11-16 | Lockout counts wrong passwords and wrong codes together: 5 → locked 15 min | One limit for both steps of sign-in |
| 8 | 2026-11-16 | CSP: scripts by per-request nonce (`proxy.ts`); `style-src 'unsafe-inline'` | React `style` props (the logo gradient) are inline style attributes; scripts stay strict |
| 9 | 2026-11-16 | Tests use mongodb-memory-server; local development uses the same mongod binary via `pnpm db:local` on port 27018 | Works without Docker; never clashes with MyClinicSoft's Mongo on 27017 |
| 10 | 2026-11-16 | End-to-end checks drive the installed Microsoft Edge with playwright-core (`e2e/`) | No browser download; same engine staff will use on Windows |
| 11 | 2026-11-16 | Native `<dialog>` for confirmations, no dialog library | Built-in focus trap, Escape and top layer |
| 12 | 2026-11-16 | Forms submit through a transition (`useFormAction`), not `<form action>` | React 19 clears a form after its action; a refused form must keep what was typed |
| 13 | 2026-11-16 | API keys (`lpk_<prefix>_<random>`) stored as SHA-256, not bcrypt (plan said bcrypt) | 24 random bytes need no slow hash; keeps order intake fast. Passwords stay bcrypt |
| 14 | 2026-11-16 | `X-API-Secret` not issued in v1; the API key alone authenticates orders | One credential to manage; MyClinicSoft sends the secret only when configured |
| 15 | 2026-11-16 | Adding a clinic shows the exact `LAB_INTEGRATIONS` JSON entry for MyClinicSoft support, once | Fewest steps and no retyping of secrets |
| 16 | 2026-11-16 | Clinic test names match on code first, then on the name compared the way MyClinicSoft does (lower case, punctuation → space) | MyClinicSoft sends free-text `test.type` and an optional code; same normalising as its `panelFor()` |
| 17 | 2026-11-16 | Each test carries "common names"; "Add common names" maps them all for a clinic in one step. A common name may belong to one test only | Connecting a clinic shouldn't mean typing 25 names; no ambiguity about which test a name means |
| 18 | 2026-11-16 | Tests are never deleted, only switched off; a name pointing at a switched-off test refuses orders (UNKNOWN_TEST) | Orders and results keep pointing at the test |
| 19 | 2026-11-16 | Sample tests stay marked until an admin ticks "Ranges checked against our analyser" and saves; a warning shows on the catalog until then | Textbook ranges must never quietly become a lab's ranges |
| 20 | 2026-11-16 | Reference bands: by sex (any/male/female) and age "from … to under …" in days; a sex-specific band beats "anyone", an age band beats an open one; overlapping bands for the same sex are refused | One unambiguous band per patient; criticals apply even when no band fits |
| 21 | 2026-11-16 | `pnpm db:indexes` shows index changes; `-- --apply` makes them | Production has autoIndex off |
| 22 | 2026-11-16 | `requestId` is `ord_` + 16 random base64url characters | Not guessable, not a database id; MyClinicSoft stores it and it comes back on results |
| 23 | 2026-11-16 | Intake order: key → rate limit → body → known requestCode (200) → patient → test → store. A repeat answers 200 even if names changed since | A clinic retrying must never get a different answer for an order already here |
| 24 | 2026-11-16 | Malformed body → `400 INVALID_REQUEST`; body over 64 KB → `413 TOO_LARGE`; unexpected failure → `500 SERVER_ERROR` (all in the contract's error shape) | Contract lists only 401/403/422/429; these cover the rest without breaking MyClinicSoft, which treats any non-2xx as failed |
| 25 | 2026-11-16 | Unknown or missing urgency is stored as `routine`, with the sent value kept in `extras.urgencySent`; gender other than male/female is kept as text with no sex | Never refuse an order over a label; ranges then use "anyone" bands |
| 26 | 2026-11-16 | Refused test names (UNKNOWN_TEST) are counted per clinic, without patient details, kept 30 days, shown on the clinic's Test names page with a "Use" button; adding the name clears them | Otherwise the lab can't know what names a clinic actually sends |
| 27 | 2026-11-16 | Rate limit counts every authenticated request, valid or not, in a per-clinic per-minute MongoDB counter with a TTL | Works across server instances without Redis |
| 28 | 2026-11-16 | The mock clinic copies MyClinicSoft's webhook checks rule for rule (scripts/mock-clinic/verify.ts) instead of reusing the lab's own signer | An independent check: a signing bug can't hide by being on both sides |
| 29 | 2026-11-16 | Mock clinic state lives in files under e2e/.out/mock-clinic (sent orders, received webhooks); `POST /mock/fail` makes the next N webhooks fail | send-order, the server and e2e scripts share it; delivery retries can be tested on demand |
| 30 | 2026-11-16 | Inbox views: New, Waiting for specimen, In the lab, Released (7 days), Rejected (30 days); within a clinic STAT → urgent → routine, oldest first; clinics with the most pressing order first | FR-1; staff see what to act on first |
| 31 | 2026-11-16 | Accept/reject: admin, front desk, medtech. Signatories (unless also medtech) and phlebotomists can't | Front-desk work; phlebotomists start at check-in |
| 32 | 2026-11-16 | Status changes are a conditional update on the current status; a second click or a colleague acting at once gets "already accepted" | No double transitions without locks |
| 33 | 2026-11-16 | Reject reasons are a fixed list plus details (required for "Other"), stored as one text "Reason: details" | FR-3; short, consistent reasons for the Phase 2 status feed |
| 34 | 2026-11-16 | Check-in records the ID type and two explicit ticks (name matches, birth date matches); checking in a received order accepts it | FR-4; one step at the counter instead of two; a mismatch means reject, not collect |
| 35 | 2026-11-16 | The accession number is made when the collection is recorded, `YYMMDD-NNNN` by the Manila date of collection | PLAN §11.5; a number only exists for a real container |
| 36 | 2026-11-16 | Collection: admin, phlebotomist, medtech. Check-in: admin, front desk, phlebotomist. Specimen rejection: admin, phlebotomist, medtech | Matches who stands at each step in a small PH lab |
| 37 | 2026-11-16 | A rejected specimen stays on record (struck through); the recollection is a new specimen with a new accession number and `recollectOf`; the order goes back to accepted | FR-6; the audit trail keeps both containers |
| 38 | 2026-11-16 | Labels: 50 × 25 mm, Code 128 of the accession number only, drawn in the browser (jsbarcode SVG), black on white, on a print page outside the app shell; up to 6 copies | Scanner-readable; prints from any browser to a label printer |
| 39 | 2026-11-16 | Scan boxes on Check-in and Specimens accept an accession number, a request code or a lab order ID; an exact hit on Check-in opens the patient | Scanners type the code and Enter |
| 40 | 2026-11-16 | Worklists cover collected and in-progress orders per catalog section; turnaround runs from collection; past the target is "Overdue" (amber), past twice it "Overdue ×2" (red) | FR-9; words beside colour |
| 41 | 2026-11-16 | Results are entered by medtechs and signatories; the person who last saved the values is the enterer, and can't release them | FR-13 four-eyes, even for a signatory who is also a medtech |
| 42 | 2026-11-16 | A number analyte accepts a number, a bound (`<0.5`, `>1000`) or "Not done"; every analyte needs one of these to send for validation | Real bench results include bounds and tests not run |
| 43 | 2026-11-16 | Release needs the signatory role and a licence number on the account; a critical value needs the call record (who called, who took it, when) first | FR-13, FR-14; the report prints the licence |
| 44 | 2026-11-16 | The webhook body is built and frozen at release on the Delivery row; every retry signs and sends the same bytes | Contract: sign the exact bytes sent |
| 45 | 2026-11-16 | Releases send at once via `after()`; `/api/jobs/deliveries` (GET or POST, Bearer CRON_SECRET) is the every-minute safety net; rows are claimed with an atomic lock | FR-15 within 30 s; no Redis; two runners never double-send |
| 46 | 2026-11-16 | Any 2xx counts as delivered; 400/401/404/409, other 4xx and redirects flag; 5xx, 408, 429, timeouts and network errors retry (1, 5, 15, 60 min, then hourly, 24 h) | Contract §2; a redirect is never followed |
| 47 | 2026-11-16 | Only the order's newest released version moves the order to delivered | A late v1 delivery can't mark a pending correction delivered |
| 48 | 2026-11-16 | A correction is made directly as version n+1 (values + reason, status submitted); the old version gets supersededBy at once and shows "Replaced by vN"; attachments carry over | FR-16; the order goes back to awaiting validation per the state machine |
| 49 | 2026-11-16 | Attachments: upload through `POST /api/attachments` (Origin-checked, 10 MB, type sniffed from the bytes: PDF, PNG, JPEG), only onto a draft; GridFS behind `FileStore` | FR-12; server actions cap bodies at 1 MB |
| 50 | 2026-11-16 | Report serial: 12 Crockford base32 characters as XXXX-XXXX-XXXX; `/verify/<serial>` shows lab, release time, test and status only, 20 checks per minute per address | FR-17; no values, no patient |
| 51 | 2026-11-16 | Every view of a result, report or attachment is written to the audit log | Security and privacy: "covering views of results too" |
| 52 | 2026-11-16 | Privacy scripts match one patient within one clinic (patient code, or name + birth date); delete removes orders, specimens, results, files and deliveries, and strips details from their audit entries | The only change ever made to audit entries; who-did-what stays |
| 53 | 2026-11-16 | `GET /api/desktop/summary` gives the desktop app (../lab-partner-desktop) per-role counts and alert items with stable ids; label and report pages print through `window.labDesktop.print()` when present (`lib/desktop-bridge.ts`), else `window.print()` | Desktop alerts and direct printing without web push or a second API |
| 54 | 2026-11-16 | First-time setup in the browser at `/setup`: lab details, first admin with their own password, optional sample tests; then straight to authenticator setup. Shown only while the database has no lab; `/login` sends there on an empty install. Production needs `SETUP_TOKEN`; a database lock lets only one setup run | No terminal access needed on the server; an empty public install can't be claimed by a stranger. `pnpm seed` stays for scripted installs |
