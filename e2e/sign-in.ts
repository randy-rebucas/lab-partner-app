/**
 * First sign-in of a freshly seeded admin: password → authenticator setup → own password → Today.
 *
 *   pnpm e2e:sign-in -- <email> <one-time password>
 */
import { BASE, fail, launch, signIn, step } from './lib';

async function main() {
  const [email, oneTime] = process.argv.slice(2).filter((a) => a !== '--');
  if (!email || !oneTime) fail('Usage: pnpm e2e:sign-in -- <email> <one-time password>');
  const { browser, page } = await launch();
  try {
    step('wrong password is refused with a plain message');
    await page.goto(`${BASE}/login`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('definitely-not-it');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByText('Email or password is wrong.').waitFor();

    step('one-time password → authenticator setup → code');
    await signIn(page, email, oneTime);

    step('forced to choose a new password');
    if (!page.url().endsWith('/login/password')) fail(`expected /login/password, got ${page.url()}`);
    const newPassword = `lab partner ${Date.now()} ok`;
    await page.getByLabel('Current password').fill(oneTime);
    await page.getByLabel('New password', { exact: true }).fill(newPassword);
    await page.getByLabel('New password again').fill(newPassword);
    await page.getByRole('button', { name: 'Save password' }).click();
    await page.waitForURL(`${BASE}/`);

    step('lands on Today, signed in');
    await page.getByRole('heading', { name: /^Good (morning|afternoon|evening), / }).waitFor();
    await page.screenshot({ path: 'e2e/.out/today.png' });

    console.log(`\n✓ sign-in flow works. New password for ${email}: ${newPassword}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => fail(String(e?.stack || e)));
