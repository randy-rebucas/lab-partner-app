/**
 * Check-in, collection, labels, specimen rejection and recollection.   pnpm e2e:specimens
 * Needs the mock clinic (pnpm mock:clinic) and pnpm e2e:clinics + e2e:catalog first.
 */
import { execFileSync } from 'node:child_process';
import type { Browser } from 'playwright-core';
import { BASE, fail, launch, signIn, step } from './lib';
import { E2E_PASSWORD, E2E_TOTP_SECRET } from './users';

const run = Date.now().toString(36).toUpperCase().slice(-5);

function mockOrder(args: string[]): string {
  const out = execFileSync(process.execPath, ['--import', 'tsx', 'scripts/mock-clinic/send-order.ts', ...args], { encoding: 'utf8' });
  process.stdout.write(out);
  const code = out.match(/^201\s+(LR-\S+)/m)?.[1];
  if (!code) fail(`mock order failed: ${out}`);
  return code;
}

async function as(browser: Browser, email: string) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await signIn(page, email, E2E_PASSWORD, E2E_TOTP_SECRET);
  return page;
}

async function main() {
  step('the mock clinic sends a CBC order');
  const requestCode = mockOrder(['--patient', `Ana Villa${run}`, '--dob', '1988-05-14', '--sex', 'female', '--test', 'CBC']);

  const { browser, page: _unused } = await launch();
  await _unused.close();
  try {
    step('front desk scans the request slip and lands on the patient');
    const desk = await as(browser, 'desk@e2e.local');
    await desk.goto(`${BASE}/check-in`);
    await desk.getByLabel('Scan or search').fill(requestCode);
    await desk.keyboard.press('Enter');
    await desk.waitForURL(/\/check-in\/[a-f0-9]{24}$/);
    const orderUrl = desk.url();
    await desk.getByText('Checking the patient in accepts it.').waitFor();

    step('the ID check needs the ID type and both matches');
    await desk.getByRole('button', { name: 'Check in' }).click();
    await desk.getByText('Choose the ID you checked.').waitFor();
    await desk.getByText('Tick this once the birth date on the ID matches the order.').waitFor();
    await desk.getByLabel('ID shown').selectOption('Driver’s licence');
    await desk.getByLabel(/The name on the ID is/).check();
    await desk.getByLabel(/The birth date on the ID is/).check();
    await desk.getByRole('button', { name: 'Check in' }).click();
    await desk.getByText(/Driver’s licence checked by Dina Reyes/).waitFor();
    await desk.getByText('A phlebotomist records the collection.').waitFor();
    await desk.screenshot({ path: 'e2e/.out/check-in.png', fullPage: true });

    step('the phlebotomist finds the patient waiting and records the collection');
    const phleb = await as(browser, 'phleb@e2e.local');
    await phleb.goto(`${BASE}/check-in?q=Villa${run}`);
    await phleb.getByText('Checked in, waiting for collection').waitFor();
    await phleb.getByRole('link', { name: new RegExp(`Villa${run}`) }).click();
    await phleb.waitForURL(orderUrl);
    if ((await phleb.getByLabel('Container').inputValue()) !== 'Lavender top (EDTA)') fail('the container should default from the catalog');
    await phleb.getByRole('button', { name: 'Record collection' }).click();
    await phleb.getByRole('link', { name: 'Print label' }).waitFor();
    const accession = await phleb.getByText(/^\d{6}-\d{4}$/).first().innerText();
    await phleb.screenshot({ path: 'e2e/.out/collected.png', fullPage: true });

    step('the label shows the accession number as a Code 128 barcode');
    const specimenHref = await phleb.getByRole('link', { name: 'Print label' }).first().getAttribute('href');
    const label = await browser.newPage({ viewport: { width: 800, height: 400 } });
    await label.context().addCookies(await phleb.context().cookies());
    await label.goto(`${BASE}${specimenHref!.replace('?print=1', '')}?copies=2`);
    await label.getByRole('img', { name: `Barcode ${accession}` }).first().waitFor();
    if ((await label.locator('section[aria-label^="Label"]').count()) !== 2) fail('expected 2 copies');
    // The bars are drawn in the browser after the page loads.
    await label.locator('svg[aria-label^="Barcode"] g rect').first().waitFor();
    const bars = await label.locator('svg[aria-label^="Barcode"]').first().locator('g rect').count();
    if (bars < 20) fail(`barcode looks empty (${bars} bars)`);
    await label.screenshot({ path: 'e2e/.out/label.png' });

    step('a medtech scans the specimen and rejects it as hemolysed');
    const med = await as(browser, 'medtech@e2e.local');
    await med.goto(`${BASE}/specimens`);
    await med.getByLabel('Scan or search').fill(accession);
    await med.keyboard.press('Enter');
    await med.waitForURL(/q=/);
    await med.getByRole('button', { name: `Reject specimen ${accession}` }).click();
    await med.getByLabel('Reason').selectOption('Hemolysed');
    await med.getByRole('dialog').getByRole('button', { name: 'Reject specimen' }).click();
    await med.getByText('Specimen rejected. The order is back at check-in for a recollection.').waitFor();
    await med.getByText('Rejected', { exact: true }).waitFor();

    step('the phlebotomist sees Recollect and collects a new specimen with a new number');
    await phleb.goto(`${BASE}/check-in?q=Villa${run}`);
    await phleb.getByText('Recollect').waitFor();
    await phleb.goto(orderUrl);
    await phleb.getByText(new RegExp(`Specimen ${accession} was rejected`)).waitFor();
    await phleb.getByRole('button', { name: 'Record collection' }).click();
    // The page now shows the new specimen; the rejected one is named only in the warning above.
    await phleb.getByRole('link', { name: 'Print label' }).waitFor();
    const second = await phleb.getByText(/^\d{6}-\d{4}$/).first().innerText();
    if (second === accession) fail('the recollection reused the accession number');

    step('the order page shows both specimens');
    await phleb.goto(orderUrl.replace('/check-in/', '/orders/'));
    await phleb.waitForURL(/\/(orders|no-access)/);
    const viewer = phleb.url().includes('no-access') ? desk : phleb;
    await viewer.goto(orderUrl.replace('/check-in/', '/orders/'));
    await viewer.getByText('Recollection', { exact: true }).waitFor();
    await viewer.getByText(accession, { exact: true }).waitFor();
    await viewer.getByText(second, { exact: true }).waitFor();
    await viewer.screenshot({ path: 'e2e/.out/order-specimens.png', fullPage: true });

    console.log('\n✓ check-in and specimens work');
  } finally {
    await browser.close();
  }
}

main().catch((e) => fail(String(e?.stack || e)));
