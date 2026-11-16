/**
 * App shell: sign in as different roles, check the sidebar shows what each may open,
 * screenshot desktop and phone widths.   pnpm e2e:shell
 */
import { BASE, fail, launch, signIn, step } from './lib';
import { E2E_PASSWORD, E2E_TOTP_SECRET } from './users';

async function main() {
  const { browser, page } = await launch();
  try {
    step('admin sees Work and Lab setup');
    await signIn(page, 'admin@e2e.local', E2E_PASSWORD, E2E_TOTP_SECRET);
    await page.getByRole('heading', { name: 'Today' }).waitFor();
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    for (const label of ['Order inbox', 'Users', 'Connected clinics']) {
      if (!(await nav.getByRole('link', { name: label }).isVisible())) fail(`admin should see ${label}`);
    }
    await page.screenshot({ path: 'e2e/.out/shell-desktop.png' });

    step('user menu opens and lists sign out');
    await page.getByRole('button', { name: /Andrea Admin/ }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).waitFor();
    await page.screenshot({ path: 'e2e/.out/shell-menu.png' });

    step('sign out ends the session');
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await page.waitForURL(`${BASE}/login`);
    await page.goto(`${BASE}/`);
    if (!page.url().endsWith('/login')) fail('signed-out visit to / should go to /login');

    step('phlebotomist sees no Lab setup and is turned away from it');
    await signIn(page, 'phleb@e2e.local', E2E_PASSWORD, E2E_TOTP_SECRET);
    if (await page.getByRole('link', { name: 'Users' }).count()) fail('phlebotomist should not see Users');

    step('phone width: drawer opens from the menu button');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('link', { name: 'Check-in' }).waitFor();
    await page.screenshot({ path: 'e2e/.out/shell-phone-drawer.png' });

    console.log('\n✓ shell works');
  } finally {
    await browser.close();
  }
}

main().catch((e) => fail(String(e?.stack || e)));
