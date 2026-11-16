/**
 * Lab setup, part one: lab profile and users.   pnpm e2e:admin-users
 */
import { BASE, fail, launch, signIn, step } from './lib';
import { E2E_PASSWORD, E2E_TOTP_SECRET } from './users';

async function main() {
  const { browser, page } = await launch();
  try {
    await signIn(page, 'admin@e2e.local', E2E_PASSWORD, E2E_TOTP_SECRET);

    step('lab profile saves');
    await page.goto(`${BASE}/admin/lab`);
    await page.getByLabel('DOH licence number').fill('12-345-26-CL-2');
    await page.getByRole('button', { name: 'Save lab profile' }).click();
    await page.getByText('Lab profile saved.').waitFor();
    await page.screenshot({ path: 'e2e/.out/admin-lab.png', fullPage: true });

    step('a signatory without a licence number is refused');
    await page.goto(`${BASE}/admin/users`);
    await page.getByRole('button', { name: 'Add person' }).click();
    const email = `e2e.${Date.now()}@lab.local`;
    await page.getByLabel('Full name').fill('Dr. Ramon Velasco');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel(/Pathologist/).check();
    await page.getByRole('button', { name: 'Add person' }).last().click();
    await page.getByText(/A signatory needs a licence number/).waitFor();

    step('with a licence number the person is added and the one-time password shown once');
    await page.getByLabel('Licence number').fill('PRC-0123456');
    await page.getByRole('button', { name: 'Add person' }).last().click();
    await page.getByText('Give them this one-time password.').waitFor();
    await page.screenshot({ path: 'e2e/.out/admin-user-added.png' });
    await page.getByRole('button', { name: 'Done' }).click();

    step('the new person is listed as not set up yet');
    const row = page.locator('li', { hasText: email });
    await row.getByText('Not set up yet').waitFor();

    step('switch off asks first, then marks the account off');
    await row.getByRole('button', { name: /Manage/ }).click();
    await page.getByRole('button', { name: 'Switch off' }).click();
    await page.getByText('Switch off this account?').waitFor();
    await page.screenshot({ path: 'e2e/.out/admin-switch-off-confirm.png' });
    await page.getByRole('button', { name: 'Switch off' }).last().click();
    await page.getByText('Switched off and signed out everywhere.').waitFor();
    await page.getByRole('button', { name: 'Close' }).click();
    await page.reload();
    await page.locator('li', { hasText: email }).getByText('Switched off').waitFor();
    await page.screenshot({ path: 'e2e/.out/admin-users.png', fullPage: true });

    step('admins cannot open their own access steps');
    await page.locator('li', { hasText: 'admin@e2e.local' }).getByRole('button', { name: /Manage/ }).click();
    await page.getByText("You can't change your own access here.").waitFor();

    console.log('\n✓ lab profile and users work');
  } finally {
    await browser.close();
  }
}

main().catch((e) => fail(String(e?.stack || e)));
