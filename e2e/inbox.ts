/**
 * Order inbox: orders sent by the mock clinic, accepted and rejected by the front desk.   pnpm e2e:inbox
 * Needs pnpm e2e:clinics and pnpm e2e:catalog first.
 */
import { execFileSync } from 'node:child_process';
import { BASE, fail, launch, signIn, step } from './lib';
import { E2E_PASSWORD, E2E_TOTP_SECRET } from './users';

const run = Date.now().toString(36).toUpperCase().slice(-5);

function mockOrder(args: string[]) {
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/mock-clinic/send-order.ts', ...args], { stdio: 'inherit' });
}

async function main() {
  step('the mock clinic sends a routine and a STAT order');
  mockOrder(['--patient', `Routine Ramos${run}`, '--test', 'CBC']);
  mockOrder(['--patient', `Stat Santos${run}`, '--test', 'Fasting blood sugar', '--stat']);

  const { browser, page } = await launch();
  try {
    await signIn(page, 'desk@e2e.local', E2E_PASSWORD, E2E_TOTP_SECRET);
    await page.goto(`${BASE}/orders?q=${run}`);

    step('STAT is listed before routine, with the age and the wait');
    const names = await page.locator('li a[href^="/orders/"]').allInnerTexts();
    const statAt = names.findIndex((n) => n.includes(`Santos${run}`));
    const routineAt = names.findIndex((n) => n.includes(`Ramos${run}`));
    if (statAt < 0 || routineAt < 0 || statAt > routineAt) fail(`STAT should come first: ${JSON.stringify(names)}`);
    await page.getByText('waiting', { exact: false }).first().waitFor();
    await page.screenshot({ path: 'e2e/.out/inbox.png', fullPage: true });

    step('accepting from the list moves the order to Waiting for specimen');
    await page.getByRole('button', { name: `Accept Ramos${run}, Routine · Complete blood count` }).click();
    await page.getByText('Accepted. It now waits for the specimen at check-in.').waitFor();
    await page.getByRole('link', { name: `Ramos${run}, Routine` }).waitFor({ state: 'detached' });
    await page.getByRole('link', { name: /Waiting for specimen/ }).click();
    await page.getByRole('link', { name: `Ramos${run}, Routine` }).waitFor();

    step('rejecting needs a reason; Other needs details');
    await page.goto(`${BASE}/orders?q=${run}`);
    await page.getByRole('link', { name: `Santos${run}, Stat` }).click();
    await page.waitForURL(/\/orders\/[a-f0-9]{24}$/);
    await page.getByText('Fever, unspecified').waitFor();
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    await page.getByLabel('Reason').selectOption('Other');
    await page.getByRole('button', { name: 'Reject order' }).click();
    await page.getByText('Say why, so the clinic knows what to fix.').waitFor();
    await page.getByLabel('Details').fill('Fasting not confirmed');
    await page.getByRole('button', { name: 'Reject order' }).click();
    await page.getByText('Rejected: Other: Fasting not confirmed').waitFor();
    await page.screenshot({ path: 'e2e/.out/order-rejected.png', fullPage: true });

    step('a new order shows up on an open inbox without reloading');
    await page.goto(`${BASE}/orders?q=${run}`);
    await page.getByText(/Updated \d/).waitFor();
    mockOrder(['--patient', `Late Lopez${run}`, '--test', 'Urinalysis', '--urgent']);
    await page.getByRole('link', { name: `Lopez${run}, Late` }).waitFor({ timeout: 40_000 });

    step('a phlebotomist is kept out of the inbox');
    const phleb = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await signIn(phleb, 'phleb@e2e.local', E2E_PASSWORD, E2E_TOTP_SECRET);
    await phleb.goto(`${BASE}/orders`);
    await phleb.waitForURL(/\/no-access$/);

    console.log('\n✓ order inbox works');
  } finally {
    await browser.close();
  }
}

main().catch((e) => fail(String(e?.stack || e)));
