/**
 * Test catalog and clinic test names.   pnpm e2e:catalog
 * Needs a connected clinic from pnpm e2e:clinics (e2e/.out/clinic.json).
 */
import { readFileSync } from 'node:fs';
import { BASE, fail, launch, signIn, step } from './lib';
import { E2E_PASSWORD, E2E_TOTP_SECRET } from './users';

async function main() {
  const clinic = JSON.parse(readFileSync('e2e/.out/clinic.json', 'utf8')) as { clinicName: string };
  const { browser, page } = await launch();
  try {
    await signIn(page, 'admin@e2e.local', E2E_PASSWORD, E2E_TOTP_SECRET);
    await page.goto(`${BASE}/admin/catalog`);

    step('an empty catalog offers the sample tests');
    const addSample = page.getByRole('button', { name: 'Add five sample tests' });
    if (await addSample.isVisible()) {
      await addSample.click();
      await page.getByRole('link', { name: /Complete blood count/ }).waitFor();
    }
    await page.screenshot({ path: 'e2e/.out/catalog.png', fullPage: true });

    step('a wrong range is pointed out on its own field, and what was typed stays');
    await page.getByRole('link', { name: /Urinalysis/ }).click();
    await page.waitForURL(/\/admin\/catalog\/[a-f0-9]{24}$/);
    const low = page.getByLabel('Low, range 1 of pH');
    const high = page.getByLabel('High, range 1 of pH');
    await low.fill('9');
    await high.fill('5');
    await page.getByRole('button', { name: 'Save test' }).click();
    await page.getByText('High must not be below low.').waitFor();
    if ((await low.inputValue()) !== '9') fail('the typed low was lost after a refused save');
    if ((await high.getAttribute('aria-invalid')) !== 'true') fail('the high field is not marked invalid');
    await page.screenshot({ path: 'e2e/.out/catalog-range-error.png', fullPage: true });

    step('fixing it and ticking “Ranges checked” clears the sample mark');
    await low.fill('5');
    await high.fill('8');
    const checked = page.getByLabel('Ranges checked against our analyser and reagents');
    if (await checked.isVisible()) await checked.check();
    await page.getByRole('button', { name: 'Save test' }).click();
    await page.getByText('Saved. New orders and results use these settings from now on.').waitFor();
    await page.reload();
    if (await page.getByText('Sample ranges', { exact: true }).isVisible()) fail('Urinalysis still shows sample ranges');

    step('a new test with age and sex bands is added');
    const code = `ESR${Date.now().toString().slice(-5)}`;
    await page.goto(`${BASE}/admin/catalog/new`);
    await page.getByLabel('Test name').fill(`Sed rate ${code}`);
    await page.getByLabel('Lab code').fill(code);
    await page.getByLabel('Section').selectOption('Hematology');
    await page.getByLabel('Specimen').selectOption('Whole blood (EDTA)');
    await page.getByLabel('Turnaround target (hours)').fill('2');
    await page.getByLabel('Common names clinics use').fill(`Westergren ${code}`);
    await page.getByLabel('Name', { exact: true }).fill('ESR');
    if ((await page.getByLabel('Key', { exact: true }).inputValue()) !== 'esr') fail('the key was not filled from the name');
    await page.getByLabel('Unit', { exact: true }).fill('mm/hr');
    await page.getByLabel('Who, range 1 of ESR').selectOption('male');
    await page.getByLabel('Low, range 1 of ESR').fill('0');
    await page.getByLabel('High, range 1 of ESR').fill('15');
    await page.getByRole('button', { name: 'Add range' }).click();
    await page.getByLabel('Who, range 2 of ESR').selectOption('male');
    await page.getByLabel('High, range 2 of ESR').fill('20');
    await page.getByRole('button', { name: 'Add test' }).click();
    await page.getByText('This range covers the same patients as range 1.').waitFor();
    await page.getByLabel('Who, range 2 of ESR').selectOption('female');
    await page.getByLabel('Low, range 2 of ESR').fill('0');
    await page.getByRole('button', { name: 'Add test' }).click();
    await page.waitForURL(/\/admin\/catalog\/[a-f0-9]{24}\?created=1$/);
    await page.getByText('Test added.').waitFor();

    step('a clinic gets the common names in one step');
    await page.goto(`${BASE}/admin/clinics`);
    await page.getByRole('link', { name: new RegExp(clinic.clinicName) }).click();
    await page.getByRole('link', { name: /Test names/ }).click();
    await page.waitForURL(/\/mappings$/);
    await page.getByRole('button', { name: 'Add common names' }).click();
    await page.getByText(/Added \d+ common names|already has every common name/).waitFor();
    await page.getByRole('cell', { name: `Westergren ${code}`, exact: true }).waitFor();

    step('a name the clinic already has is refused; a new one is added');
    await page.getByLabel('Clinic’s test name').fill('cbc!');
    await page.getByLabel('Our test').selectOption({ label: 'Complete blood count (CBC)' });
    await page.getByRole('button', { name: 'Add name' }).click();
    await page.getByText('This clinic already has this test name.').waitFor();
    await page.getByLabel('Clinic’s test name').fill(`Hematology panel ${code}`);
    await page.getByLabel('Clinic’s test code').fill(`H-${code}`);
    await page.getByRole('button', { name: 'Add name' }).click();
    await page.getByText(/Added. Orders for/).waitFor();
    if ((await page.getByLabel('Clinic’s test name').inputValue()) !== '') fail('the form was not cleared after adding');
    await page.screenshot({ path: 'e2e/.out/clinic-test-names.png', fullPage: true });

    step('removing a name asks first');
    await page.getByRole('button', { name: `Remove Hematology panel ${code}` }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
    await page.getByText('Removed. New orders under that name are refused').waitFor();
    await page.getByRole('cell', { name: `Hematology panel ${code}`, exact: true }).waitFor({ state: 'detached', timeout: 5000 }).catch(() => fail('the removed name is still listed'));

    console.log('\n✓ test catalog and clinic test names work');
  } finally {
    await browser.close();
  }
}

main().catch((e) => fail(String(e?.stack || e)));
