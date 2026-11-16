/**
 * Order intake over real HTTP, as MyClinicSoft calls it.   pnpm e2e:intake
 * Needs pnpm e2e:clinics and pnpm e2e:catalog first (a connected clinic with test names).
 */
import { readFileSync } from 'node:fs';
import { BASE, fail, launch, signIn, step } from './lib';
import { E2E_PASSWORD, E2E_TOTP_SECRET } from './users';

const clinic = JSON.parse(readFileSync('e2e/.out/clinic.json', 'utf8')) as { apiKey: string; apiEndpoint: string; clinicName: string };
const ENDPOINT = `${BASE}/v1/orders`;

async function send(body: unknown, key: string | null = clinic.apiKey) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, unknown> | null, headers: res.headers };
}

function expectReply(r: { status: number; json: Record<string, unknown> | null }, status: number, code?: string) {
  const got = (r.json?.error as { code?: string } | undefined)?.code;
  if (r.status !== status || (code && got !== code)) fail(`expected ${status} ${code ?? ''}, got ${r.status} ${JSON.stringify(r.json)}`);
}

async function main() {
  const run = Date.now().toString(36).toUpperCase();
  const order = (requestCode: string, test: Record<string, unknown> = { type: 'CBC', urgency: 'stat' }, patient: Record<string, unknown> = {}) => ({
    request: {
      requestCode,
      patient: { firstName: 'Ana', lastName: 'Reyes', dateOfBirth: '2019-04-02', gender: 'female', patientCode: 'P-01234', ...patient },
      test,
      clinicalInfo: { diagnosis: 'Fever, unspecified', chiefComplaint: 'Fever for 3 days' },
      instructions: 'Fasting not required',
    },
  });

  step('health answers without a key');
  const health = await fetch(`${BASE}/v1/health`);
  if (health.status !== 200 || (await health.json()).ok !== true) fail('health check failed');

  step('a new order: 201 with requestId; the same requestCode again: 200, same requestId');
  const first = await send(order(`LR-${run}-1`));
  expectReply(first, 201);
  if (!/^ord_/.test(String(first.json?.requestId)) || first.json?.status !== 'received') fail(`unexpected reply ${JSON.stringify(first.json)}`);
  if (first.headers.get('cache-control') !== 'no-store') fail('replies must not be cached');
  const again = await send(order(`LR-${run}-1`));
  expectReply(again, 200);
  if (again.json?.requestId !== first.json?.requestId) fail('a repeat got a different requestId');

  step('wrong key 401, no key 401');
  expectReply(await send(order(`LR-${run}-2`), 'lpk_abcdefgh_' + 'x'.repeat(32)), 401, 'UNAUTHORIZED');
  expectReply(await send(order(`LR-${run}-2`), null), 401, 'UNAUTHORIZED');

  step('unknown test 422 UNKNOWN_TEST; bad patient 422 INVALID_PATIENT; bad JSON 400');
  const unknownName = `Thyroid panel ${run}`;
  expectReply(await send(order(`LR-${run}-3`, { type: unknownName, code: `TSH-${run}`, urgency: 'routine' })), 422, 'UNKNOWN_TEST');
  expectReply(await send(order(`LR-${run}-4`, undefined, { dateOfBirth: '2019-02-30' })), 422, 'INVALID_PATIENT');
  expectReply(await send('{not json'), 400, 'INVALID_REQUEST');

  step('the refused name shows on the clinic’s Test names page and fills the form');
  const { browser, page } = await launch();
  try {
    await signIn(page, 'admin@e2e.local', E2E_PASSWORD, E2E_TOTP_SECRET);
    await page.goto(`${BASE}/admin/clinics`);
    await page.getByRole('link', { name: new RegExp(clinic.clinicName) }).click();
    await page.getByRole('link', { name: /Test names/ }).click();
    await page.getByText('Refused recently').waitFor();
    await page.getByRole('button', { name: `Use ${unknownName} in Add a name` }).click();
    if ((await page.getByLabel('Clinic’s test name').inputValue()) !== unknownName) fail('Use did not fill the test name');
    if ((await page.getByLabel('Clinic’s test code').inputValue()) !== `TSH-${run}`) fail('Use did not fill the test code');
    await page.screenshot({ path: 'e2e/.out/intake-refused.png', fullPage: true });
  } finally {
    await browser.close();
  }

  console.log('\n✓ order intake works over HTTP');
}

main().catch((e) => fail(String(e?.stack || e)));
