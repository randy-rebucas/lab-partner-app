/**
 * Lab setup, part two: connect a clinic, rotate its key.   pnpm e2e:clinics
 * Saves the connection entry to e2e/.out/clinic.json for the mock clinic (pnpm mock:clinic).
 */
import { writeFileSync } from 'node:fs';
import { BASE, fail, launch, signIn, step } from './lib';
import { E2E_PASSWORD, E2E_TOTP_SECRET } from './users';

async function main() {
  const { browser, page } = await launch();
  try {
    await signIn(page, 'admin@e2e.local', E2E_PASSWORD, E2E_TOTP_SECRET);
    await page.goto(`${BASE}/admin/clinics`);

    step('an http address to another machine is refused');
    await page.getByRole('button', { name: 'Connect a clinic' }).click();
    const name = `Reyes Family Clinic ${new Date().toISOString().slice(11, 19)}`;
    await page.getByLabel('Clinic name').fill(name);
    await page.getByLabel('MyClinicSoft address').fill('http://10.1.2.3');
    await page.getByLabel('Lab code at MyClinicSoft').fill('sample-lab');
    await page.getByLabel('Contact phone').fill('0917 555 0142');
    await page.getByRole('button', { name: 'Connect clinic' }).click();
    await page.getByText('The address must start with https://').waitFor();

    step('the mock clinic address is accepted during development');
    await page.getByLabel('MyClinicSoft address').fill('http://127.0.0.1:4010');
    await page.getByRole('button', { name: 'Connect clinic' }).click();
    await page.getByText('It is shown only now.').waitFor();
    const entry = JSON.parse(await page.locator('pre').innerText());
    if (!/^lpk_/.test(entry.apiKey) || !/^whsec_/.test(entry.webhookSecret)) fail('connection entry is missing the key or secret');
    if (!entry.apiEndpoint.endsWith('/v1/orders')) fail('apiEndpoint should end with /v1/orders');
    writeFileSync('e2e/.out/clinic.json', JSON.stringify({ ...entry, clinicName: name, platformHost: 'http://127.0.0.1:4010' }, null, 2));
    await page.screenshot({ path: 'e2e/.out/clinic-connected.png' });

    step('Done opens the clinic page');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.waitForURL(/\/admin\/clinics\/[a-f0-9]{24}$/);
    await page.getByText('Current').waitFor();

    step('a new API key leaves the old one working for 7 days');
    await page.getByRole('button', { name: 'Make new API key' }).click();
    await page.getByRole('button', { name: 'Make new key' }).click();
    await page.getByText(/New API key made. The old key keeps working until/).waitFor();
    const rotated = JSON.parse(await page.locator('pre').innerText());
    await page.reload();
    await page.getByText('Old key').waitFor();
    await page.screenshot({ path: 'e2e/.out/clinic-page.png', fullPage: true });
    writeFileSync('e2e/.out/clinic.json', JSON.stringify({ ...entry, apiKey: rotated.apiKey, clinicName: name, platformHost: 'http://127.0.0.1:4010' }, null, 2));

    console.log('\n✓ connected clinics work (details in e2e/.out/clinic.json)');
  } finally {
    await browser.close();
  }
}

main().catch((e) => fail(String(e?.stack || e)));
