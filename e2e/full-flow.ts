/**
 * The "done means" checklist (BUILD_PROMPT.md), end to end against the mock clinic.   pnpm e2e:full
 *
 * Order in from the mock clinic → accepted → checked in → collected → results with a critical value
 * and an attachment → call recorded → released by a different person → delivered with a valid
 * signature → report and public check → corrected as version 2 and delivered → a delivery retried
 * after a 500 → a delivery flagged on 401.
 *
 * Needs: pnpm dev --port 3100, pnpm mock:clinic, pnpm e2e:fixtures, e2e:clinics, e2e:catalog.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import type { Browser, Page } from 'playwright-core';
import { BASE, fail, launch, signIn, step } from './lib';
import { E2E_PASSWORD, E2E_TOTP_SECRET } from './users';

const MOCK = 'http://127.0.0.1:4010';
const run = Date.now().toString(36).toUpperCase().slice(-5);
const CBC = { Hemoglobin: '5.1', Hematocrit: '38', RBC: '4.4', WBC: '6.8', Platelets: '240', Neutrophils: '58', Lymphocytes: '32', Monocytes: '6', Eosinophils: '3', Basophils: '1' };

function mockOrder(args: string[]): string {
  const out = execFileSync(process.execPath, ['--import', 'tsx', 'scripts/mock-clinic/send-order.ts', ...args], { encoding: 'utf8' });
  process.stdout.write(out);
  const code = out.match(/^201\s+(LR-\S+)/m)?.[1];
  if (!code) fail(`mock order failed: ${out}`);
  return code;
}

async function mock(path: string, body?: unknown) {
  const res = await fetch(`${MOCK}${path}`, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) });
  return res.json();
}

async function as(browser: Browser, email: string) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await signIn(page, email, E2E_PASSWORD, E2E_TOTP_SECRET);
  return page;
}

type Desk = { desk: Page; phleb: Page; med: Page; path: Page };

/** Mock order → accepted and checked in by the desk → collected by the phlebotomist. Returns the results URL. */
async function toBench({ desk, phleb }: Desk, patient: string): Promise<string> {
  const code = mockOrder(['--patient', patient, '--dob', '1985-02-11', '--sex', 'female', '--test', 'CBC']);
  await desk.goto(`${BASE}/check-in?q=${code}`);
  await desk.waitForURL(/\/check-in\/[a-f0-9]{24}$/);
  const url = desk.url();
  await desk.getByLabel('ID shown').selectOption('PhilSys national ID');
  await desk.getByLabel(/The name on the ID is/).check();
  await desk.getByLabel(/The birth date on the ID is/).check();
  await desk.getByRole('button', { name: 'Check in' }).click();
  await desk.getByText(/PhilSys national ID checked by/).waitFor();
  await phleb.goto(url);
  await phleb.getByRole('button', { name: 'Record collection' }).click();
  await phleb.getByRole('link', { name: 'Print label' }).waitFor();
  return url.replace('/check-in/', '/results/');
}

async function enterValues(med: Page, url: string, values: Record<string, string>) {
  await med.goto(url);
  for (const [name, v] of Object.entries(values)) await med.getByLabel(name, { exact: true }).fill(v);
}

async function release(path: Page, url: string) {
  await path.goto(url);
  await path.getByRole('button', { name: 'Release results' }).click();
  await path.getByRole('alertdialog').getByRole('button', { name: 'Release results' }).click();
  await path.getByText(/Released\. Report [0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}/).waitFor();
}

/** Reload until the delivery panel says what we expect (sending happens just after the release). */
async function waitForDelivery(page: Page, url: string, text: RegExp, seconds = 40) {
  for (let i = 0; i < seconds / 2; i++) {
    await page.goto(url);
    if (await page.getByText(text).count()) return;
    await page.waitForTimeout(2000);
  }
  fail(`delivery never showed ${text}`);
}

async function main() {
  writeFileSync('e2e/.out/sample-report.pdf', '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
  await mock('/mock/fail', { status: null });
  const { browser, page: first } = await launch();
  await first.close();
  try {
    const actors: Desk = {
      desk: await as(browser, 'desk@e2e.local'),
      phleb: await as(browser, 'phleb@e2e.local'),
      med: await as(browser, 'medtech@e2e.local'),
      path: await as(browser, 'path@e2e.local'),
    };
    const { med, path } = actors;

    step('1. an order from the mock clinic is accepted, checked in and collected');
    const url = await toBench(actors, `Lorna Cruz${run}`);

    step('2. the medtech finds it on the Hematology worklist');
    await med.goto(`${BASE}/worklists`);
    await med.getByRole('link', { name: /Hematology/ }).click();
    await med.getByText(`Cruz${run}, Lorna`).click();
    await med.waitForURL(url);

    step('3. values are flagged as typed: Hb 5.1 is critical');
    await enterValues(med, url, CBC);
    await med.getByRole('row', { name: /Hemoglobin/ }).getByLabel('Critical low').waitFor();
    await med.getByRole('button', { name: 'Save draft' }).click();
    await med.getByText('Draft saved.').waitFor();

    step('4. a PDF is attached to the draft');
    await med.getByLabel('Attach a file').setInputFiles('e2e/.out/sample-report.pdf');
    await med.getByText('Attached sample-report.pdf.').waitFor();
    await med.getByRole('link', { name: 'sample-report.pdf' }).waitFor();

    step('5. sent for validation');
    await med.getByRole('button', { name: 'Send for validation' }).click();
    await med.getByText('Waiting for validation').waitFor();
    await med.screenshot({ path: 'e2e/.out/flow-entered.png', fullPage: true });

    step('6. the signatory sees it in Validation; release is blocked until the call is recorded');
    await path.goto(`${BASE}/validation`);
    await path.getByText('Critical, call needed').waitFor();
    await path.goto(url);
    await path.getByText('Record the call to the clinic about the critical value first.').waitFor();
    if (await path.getByRole('button', { name: 'Release results' }).isEnabled()) fail('release should be blocked before the call');
    await path.getByLabel('Taken at the clinic by').fill('Nurse Joy Bautista');
    await path.getByRole('button', { name: 'Record the call' }).click();
    await path.getByText(/Critical value called by Dr. Patricia Lim to Nurse Joy Bautista/).waitFor();

    step('7. released by a different person, and delivered with a valid signature within 30 seconds');
    const releasedAt = Date.now();
    await release(path, url);
    await waitForDelivery(path, url, /Sent to Reyes Family Clinic/, 30);
    if (Date.now() - releasedAt > 30_000) fail('delivery took over 30 seconds');
    const received = (await mock('/mock/received')) as { status: number; applied: boolean; body: { resultId: string; requestCode: string; abnormalFlags: Record<string, string>; interpretation: string } }[];
    const v1 = received.filter((r) => r.applied && r.body?.interpretation?.includes('Critical: hb 5.1')).at(-1);
    if (!v1 || !/-v1$/.test(v1.body.resultId) || v1.body.abnormalFlags.hb !== 'low') fail(`the mock clinic did not apply v1: ${JSON.stringify(received.at(-1))}`);
    await path.getByText('Delivered', { exact: true }).first().waitFor();
    await path.screenshot({ path: 'e2e/.out/flow-delivered.png', fullPage: true });

    step('8. the A4 report prints the signatory and licence, and its serial checks out publicly');
    const reportHref = await path.getByRole('link', { name: 'Report' }).first().getAttribute('href');
    const report = await browser.newPage({ viewport: { width: 1000, height: 1300 } });
    await report.context().addCookies(await path.context().cookies());
    await report.goto(`${BASE}${reportHref}`);
    await report.getByText('PRC-0098123').waitFor();
    await report.getByText(/Critical value called to Nurse Joy Bautista/).waitFor();
    const serial = (await report.getByText(/^Report [0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/).first().innerText()).replace('Report ', '');
    await report.screenshot({ path: 'e2e/.out/flow-report.png', fullPage: true });
    const pub = await browser.newPage();
    await pub.goto(`${BASE}/verify/${serial}`);
    await pub.getByText('This is a genuine report.').waitFor();
    if (await pub.getByText(`Cruz${run}`).count()) fail('the public check shows the patient name');
    if (await pub.getByText('5.1').count()) fail('the public check shows a value');
    await pub.screenshot({ path: 'e2e/.out/flow-verify.png' });

    step('9. the medtech corrects the result; the correction is released as v2 and delivered');
    await med.goto(url);
    await med.getByRole('button', { name: 'Correct result' }).click();
    const dialog = med.getByRole('dialog');
    await dialog.getByLabel('Reason for the correction').fill('Hemoglobin re-run on a fresh sample');
    await dialog.getByLabel('Hemoglobin', { exact: true }).fill('11.6');
    await dialog.getByRole('button', { name: 'Send correction for validation' }).click();
    await med.getByText(/Correction of version 1: Hemoglobin re-run/).waitFor();
    await release(path, url);
    await waitForDelivery(path, url, /Sent to Reyes Family Clinic/, 30);
    await path.getByText('Replaced by v2').waitFor();
    const after = (await mock('/mock/received')) as { applied: boolean; body: { resultId: string; interpretation: string } }[];
    const v2 = after.filter((r) => r.applied).at(-1);
    if (!v2 || !/-v2$/.test(v2.body.resultId) || !v2.body.interpretation.startsWith('Corrected result: Hemoglobin re-run')) fail(`v2 not applied: ${JSON.stringify(v2)}`);
    await pub.goto(`${BASE}/verify/${serial}`);
    await pub.getByText(/replaced by a corrected version \(version 2\)/).waitFor();
    await path.screenshot({ path: 'e2e/.out/flow-corrected.png', fullPage: true });

    step('10. when the clinic answers 500 the delivery retries; Send again delivers it');
    const url2 = await toBench(actors, `Rico Tan${run}`);
    await enterValues(med, url2, { ...CBC, Hemoglobin: '13.4' });
    await med.getByRole('button', { name: 'Send for validation' }).click();
    await med.getByText('Waiting for validation').waitFor();
    await mock('/mock/fail', { status: 500, times: 1 });
    await release(path, url2);
    await waitForDelivery(path, url2, /The clinic answered 500\. Try 2 at/, 30);
    await actors.desk.goto(`${BASE}/deliveries`);
    await actors.desk.getByRole('button', { name: /^Send .* again$/ }).first().waitFor();
    await actors.desk.getByText(/The clinic answered 500/).first().waitFor();
    await actors.desk.screenshot({ path: 'e2e/.out/flow-deliveries.png', fullPage: true });
    await path.goto(url2);
    const resultIdLine = await path.getByText(/^\d{6}-\d{4}-v1$/).first().innerText();
    await actors.desk.getByRole('button', { name: `Send ${resultIdLine} again` }).click();
    await waitForDelivery(path, url2, /Sent to Reyes Family Clinic/, 20);

    step('11. when the clinic answers 401 the delivery is flagged with what to check');
    const url3 = await toBench(actors, `Ana Lim${run}`);
    await enterValues(med, url3, { ...CBC, Hemoglobin: '13.0' });
    await med.getByRole('button', { name: 'Send for validation' }).click();
    await med.getByText('Waiting for validation').waitFor();
    await mock('/mock/fail', { status: 401, times: 1 });
    await release(path, url3);
    await waitForDelivery(path, url3, /Check this server’s clock and the clinic’s webhook secret/, 30);
    await path.getByText('Not delivered').waitFor();

    step('12. the cron route needs its secret');
    const cronSecret = readFileSync('.env.local', 'utf8').match(/^CRON_SECRET=(.*)$/m)?.[1]?.trim();
    const bad = await fetch(`${BASE}/api/jobs/deliveries`, { method: 'POST', headers: { Authorization: 'Bearer wrong' } });
    if (bad.status !== 401) fail(`cron with a wrong secret answered ${bad.status}`);
    const good = await fetch(`${BASE}/api/jobs/deliveries`, { method: 'POST', headers: { Authorization: `Bearer ${cronSecret}` } });
    const summary = await good.json();
    if (good.status !== 200 || typeof summary.attempted !== 'number') fail(`cron run failed: ${good.status} ${JSON.stringify(summary)}`);

    console.log('\n✓ the full flow works: order → collection → critical result → release → signed delivery → report → correction v2 → retry → flag');
  } finally {
    await mock('/mock/fail', { status: null }).catch(() => undefined);
    await browser.close();
  }
}

main().catch((e) => fail(String(e?.stack || e)));
