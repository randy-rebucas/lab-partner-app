/**
 * First-time setup on an empty database, in production mode.   pnpm e2e:setup
 *
 * Needs a production build serving an EMPTY database with a known SETUP_TOKEN, for example:
 *   pnpm build
 *   MONGODB_URI=mongodb://127.0.0.1:27018/lab_partner_setup_e2e SETUP_TOKEN=e2e-setup-token-2026 \
 *     APP_URL=http://localhost:3101 pnpm start --port 3101
 * Then: E2E_BASE_URL=http://localhost:3101 E2E_SETUP_TOKEN=e2e-setup-token-2026 pnpm e2e:setup
 */
import { BASE, fail, freshCode, launch, step } from './lib';

const TOKEN = process.env.E2E_SETUP_TOKEN ?? '';

async function main() {
  if (!TOKEN) fail('Set E2E_SETUP_TOKEN to the server’s SETUP_TOKEN.');
  const { browser, page } = await launch();
  try {
    step('a fresh install sends every visitor to setup');
    await page.goto(`${BASE}/`);
    await page.waitForURL(/\/setup$/);
    await page.getByRole('heading', { name: 'Set up your lab' }).waitFor();

    step('a wrong token is refused and what was typed stays');
    await page.getByLabel('Setup token').fill('wrong-token');
    await page.getByLabel('Lab name').fill('Santos Diagnostic Laboratory');
    await page.getByLabel('DOH licence number').fill('12-345-26-CL-2');
    await page.getByLabel('Full name').fill('Juan Dela Cruz');
    await page.getByLabel('Email').fill('juan@santoslab.ph');
    await page.getByLabel('Password', { exact: true }).fill('a long lab password 2026');
    await page.getByLabel('Password again').fill('a long lab password 2026');
    await page.getByRole('button', { name: 'Set up the lab' }).click();
    await page.getByText('That isn’t this server’s setup token.').waitFor();
    if ((await page.getByLabel('Lab name').inputValue()) !== 'Santos Diagnostic Laboratory') fail('the form lost what was typed');
    await page.screenshot({ path: 'e2e/.out/setup.png', fullPage: true });

    step('the right token sets up the lab and goes straight to the authenticator step');
    await page.getByLabel('Setup token').fill(TOKEN);
    await page.getByRole('button', { name: 'Set up the lab' }).click();
    await page.waitForURL(/\/login\/setup$/);
    const key = (await page.locator('p.select-all').innerText()).replace(/\s/g, '');
    await page.getByLabel('6-digit code').fill(await freshCode(key, 'juan'));
    await page.getByRole('button', { name: 'Turn on and sign in' }).click();
    await page.waitForURL(`${BASE}/`);
    await page.getByRole('heading', { name: /^Good (morning|afternoon|evening), Juan./ }).waitFor();

    step('the sample tests are in the catalog, and setup is closed for good');
    await page.goto(`${BASE}/admin/catalog`);
    await page.getByText('Complete blood count').waitFor();
    await page.goto(`${BASE}/admin/lab`);
    if ((await page.getByLabel('DOH licence number').inputValue()) !== '12-345-26-CL-2') fail('the licence number was not saved');
    const other = await browser.newPage();
    await other.goto(`${BASE}/setup`);
    await other.waitForURL(/\/login$/);

    console.log('\n✓ first-time setup works');
  } finally {
    await browser.close();
  }
}

main().catch((e) => fail(String(e?.stack || e)));
