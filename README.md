# MyClinicSoft Lab

A web app for a diagnostic laboratory that receives lab orders from clinics running MyClinicSoft and sends signed results back to them.

**What it does:** a clinic's MyClinicSoft sends an order. The lab then:

1. Accepts the order and checks the patient in.
2. Collects and labels the specimen.
3. Enters the results, which are flagged automatically.
4. Has a second person, a signatory, validate them.
5. Releases them.

The result then goes back to the clinic as a signed webhook, which is retried until the clinic confirms. A released result can be corrected as a new version, and the A4 report has a serial that anyone can check at `/verify/<serial>`.

The full specification is in `docs/BUILD_PROMPT.md`. The build plan is `docs/PLAN.md`, and every default chosen while building is in `docs/DECISIONS.md`.

## Contents

- [Run it locally](#run-it-locally)
- [Try the whole flow with the mock clinic](#try-the-whole-flow-with-the-mock-clinic)
- [Connect a real clinic](#connect-a-real-clinic)
- [Deploy](#deploy)
- [Roles](#roles)
- [Privacy requests](#privacy-requests)
- [Checks](#checks)
- [How it is built](#how-it-is-built)

## Run it locally

You need Node 24 and pnpm 10. Docker is not needed.

```bash
pnpm install
cp .env.example .env.local        # then fill APP_ENCRYPTION_KEY and CRON_SECRET (see the comments)
pnpm db:local                     # MongoDB on 127.0.0.1:27018, data in .data/db; leave it running
pnpm dev --port 3100              # in a second terminal; set APP_URL=http://localhost:3100 to match
pnpm seed -- --email you@yourlab.ph --name "Your Name" --lab "Your Diagnostic Lab"
```

`pnpm seed` creates the lab, its first admin and five sample tests, and prints a one-time password.

1. Open http://localhost:3100 and sign in with that password.
2. Set up an authenticator app. It is required for everyone.
3. Choose your own password.

The five sample tests are CBC, urinalysis, fasting blood sugar, lipid profile and creatinine. Their reference ranges are textbook values marked **Sample ranges**. Replace them with your analyser's ranges before releasing real results.

## Try the whole flow with the mock clinic

The mock clinic stands in for a clinic's MyClinicSoft:

- It sends orders exactly as MyClinicSoft does.
- It checks result webhooks by MyClinicSoft's rules: signature, 5-minute timestamp window, lab code, and request match.

```bash
pnpm e2e:fixtures     # test users, one per role (local database only)
pnpm e2e:clinics      # connects a test clinic and saves its key to e2e/.out/clinic.json
pnpm e2e:catalog      # sample tests + the clinic's test names
pnpm mock:clinic      # the mock clinic on 127.0.0.1:4010; leave it running
pnpm mock:order -- --stat --test CBC     # send an order (also --count 5, --test "Lipid profile", --patient "Ana Reyes")
```

The test users are `admin@`, `desk@`, `phleb@`, `medtech@`, `medtech2@` and `path@e2e.local`.

- Their password is `local test password 2026`.
- Their authenticator key is `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP`. Add it to any authenticator app, or scan a QR made from it.

`pnpm e2e:full` runs the whole flow in Microsoft Edge against the mock clinic:

1. Order, check-in, collection, then a critical result with an attachment.
2. The call to the clinic is recorded, and a different person releases the result.
3. Signed delivery, then the report and its public check.
4. A correction as version 2.
5. A retry after a 500, then a flag after a 401.

You can make the mock clinic fail on purpose:

- **Next N results:** `curl -X POST 127.0.0.1:4010/mock/fail -d '{"status":503,"times":2}'`
- **Every result:** start it with `MOCK_FAIL=500`.

## Connect a real clinic

1. **Agree on a lab code with MyClinicSoft support.** For example `santos-diagnostics`. MyClinicSoft uses it to tell labs apart.
2. **Connect the clinic in the app.** Go to **Lab setup → Connected clinics → Connect a clinic** and enter:
   - the clinic's name
   - its MyClinicSoft address, for example `https://reyesclinic.myclinicsoft.com` (no path)
   - the lab code
   - its tenant ID, if you have it
3. **Send the connection entry to MyClinicSoft support.** The app shows it **once**. It contains:
   - `apiEndpoint` (`<APP_URL>/v1/orders`)
   - `apiKey`
   - `webhookSecret`
   - `labCode`

   Support adds it to that clinic's `LAB_INTEGRATIONS`. Send it over a private channel, because the key and secret can't be shown again; if one is lost, make a new one on the clinic's page.
4. **Add the clinic's test names.** On the clinic's **Test names** page:
   - **Add common names** maps the usual names (CBC, Urinalysis, FBS…) in one step.
   - Add any others the clinic uses.
   - An order for a name that isn't listed is refused as `422 UNKNOWN_TEST` and shown under **Refused recently**; **Use** fills it into the form.
5. **Ask the clinic to send one test order.** It appears in the **Order inbox**.

**Changing credentials:**

- **New API key:** the old key keeps working for 7 days, so the clinic can switch over without a gap.
- **New webhook secret:** in force at once. Results fail with 401 until MyClinicSoft has it, and are retried for 24 hours.

### The contract, in short

**Orders in:** `POST /v1/orders` with `Authorization: Bearer <apiKey>`.

| Reply | When |
| --- | --- |
| `201 {requestId, status: "received"}` | A new order |
| `200`, same `requestId` | A repeat of a known `requestCode` |
| `401 UNAUTHORIZED` | Missing, wrong or expired key |
| `403 CLINIC_INACTIVE` | The clinic is switched off |
| `422 UNKNOWN_TEST` | The test name or code isn't mapped, or the test is switched off |
| `422 INVALID_PATIENT` | No first or last name, or an impossible birth date |
| `429 RATE_LIMITED` | More than 60 requests a minute from one clinic |

`GET /v1/health` is a liveness check with no data.

**Results out:** `POST <clinic>/api/lab-results/third-party/webhook`.

- Headers: `X-Lab-Code`, `X-Webhook-Timestamp`, and `X-Webhook-Signature: sha256=HMAC(secret, "<ts>.<body>")`.
- It is sent on release and on every correction. `resultId` is `<accession>-v<version>`.
- If the clinic answers `5xx` or doesn't answer: retried after 1, 5, 15 and 60 minutes, then hourly for 24 hours.
- If it answers `400`, `401`, `404` or `409`: flagged on **Deliveries** with what to check. **Send again** starts a fresh 24 hours.

## Deploy

- **MongoDB:** Atlas or your own replica set. Before each deploy that adds a model or index, run `pnpm db:indexes` to see the changes and `pnpm db:indexes -- --apply` to make them. Production does not build indexes on start.
- **Environment:** set every variable in `.env.example`. `APP_URL` must be the public `https://` address.
- **Cron:** call `/api/jobs/deliveries` every minute with `Authorization: Bearer $CRON_SECRET`.
  - On Vercel, add a Cron Job; it sends a GET.
  - On your own server, a system cron can send a POST: `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://lab.example.ph/api/jobs/deliveries`
  - Releases also send at once, so the cron only matters for retries.
- **Clinic addresses:** in production they must be `https://`. Plain `http://` to `127.0.0.1` or `localhost` works only in development, for the mock clinic.
- **Server clock:** keep it on NTP. MyClinicSoft refuses result timestamps more than 5 minutes off.
- **Where MyClinicSoft sends orders:** this app must be reachable at an `https://` address on the default port 443 that resolves to a public IP. MyClinicSoft refuses lab endpoints on private addresses (`checkOutboundUrl` in its `lib/lab-integration.ts`). If that MyClinicSoft sets `LAB_API_ALLOWED_HOSTS`, this app's host must be on the list. A lab app running only on a local network can't receive orders from a hosted MyClinicSoft.

## Roles

| Role | Can |
| --- | --- |
| Admin | Lab profile, users, test catalog, connected clinics and keys; everything in the work queues except entering and releasing results |
| Front desk | Accept or reject orders, check patients in, print labels and reports, resend deliveries |
| Phlebotomist | Check in, collect and label specimens, reject specimens |
| Medical technologist | Accept or reject orders, collect, enter results, record critical calls, correct released results |
| Signatory | Validate and release results (needs a licence number), send results back, resend deliveries |

**Four-eyes rule:** whoever last entered a result's values can never release it, even if they are also a signatory.

**Critical values:** a critical value blocks release until the call to the clinic is recorded: who called, who took the call, and when.

## Privacy requests

These cover Data Privacy Act requests that come through a clinic:

```bash
pnpm privacy:export -- --clinic "Reyes Family Clinic" --patient-code P-01234 --out export.json
pnpm privacy:delete -- --clinic "Reyes Family Clinic" --name "Reyes, Ana" --dob 2019-04-02            # shows what would go
pnpm privacy:delete -- --clinic "Reyes Family Clinic" --name "Reyes, Ana" --dob 2019-04-02 --confirm  # deletes
```

- Patients are matched within one clinic only.
- Deleting removes orders, specimens, result versions, attachments and deliveries.
- Audit entries stay, but without their details, so the record of who did what remains.
- Check the DOH record-keeping period before confirming a deletion.

## Checks

```bash
pnpm check            # type check, lint, unit tests (in-memory MongoDB)
pnpm e2e:<name>       # browser checks in the installed Microsoft Edge: sign-in, shell, admin-users,
                      # clinics, catalog, intake, inbox, specimens, full
```

- The browser checks need the app on port 3100 and the local database; most also need the mock clinic.
- An account's authenticator code can't be reused for 90 seconds. Wait about 30 seconds between two runs that sign in as the same person.

## How it is built

**Stack:** Next.js 16, React 19, MongoDB with Mongoose, Tailwind 4, vitest. The brand comes from MyClinicSoft: Geist and Geist Mono, the teal tokens and the logo mark.

| Area | Files |
| --- | --- |
| Order intake | `lib/orders/intake.ts` |
| Order states (every status change goes through here) | `lib/orders/status.ts`, `lib/orders/transition.ts` |
| Reference ranges and flags | `lib/catalog/flags.ts` |
| Result rules: entry, four-eyes, critical calls, release, corrections | `lib/results.ts` |
| Delivery: payload, signature, retry schedule, runner | `lib/delivery/` |
| Attachments, in GridFS behind a small interface | `lib/files.ts` |
| Mock clinic | `scripts/mock-clinic/` |
