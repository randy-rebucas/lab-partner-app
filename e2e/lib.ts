/**
 * Shared bits for the end-to-end scripts in e2e/. They drive the installed Microsoft Edge
 * (playwright-core, channel "msedge"), so no browser download is needed.
 *
 * Needs: the app running (pnpm dev --port 3100) and the local database (pnpm db:local).
 */
import { chromium, type Browser, type Page } from 'playwright-core';
import { generate } from 'otplib';

export const BASE = process.env.E2E_BASE_URL || 'http://localhost:3100';

export async function launch(): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.launch({ channel: 'msedge', headless: process.env.E2E_HEADED !== '1' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  return { browser, page };
}

export function step(name: string) {
  console.log(`• ${name}`);
}

export function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

// The app refuses a code an account has just used, so remember the last one per account.
const lastCode = new Map<string, string>();

/** The current code, waiting for the next 30-second window if this account just used it. */
export async function freshCode(secret: string, account = secret): Promise<string> {
  for (;;) {
    const code = await generate({ secret });
    if (code !== lastCode.get(account)) {
      lastCode.set(account, code);
      return code;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/** Sign in with password and code; handles first-time authenticator setup. Returns the TOTP secret. */
export async function signIn(page: Page, email: string, password: string, secret?: string): Promise<string> {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL(/\/login\/(verify|setup)/);
  if (page.url().includes('/login/setup')) {
    const key = (await page.locator('p.select-all').innerText()).replace(/\s/g, '');
    secret = key;
    await page.getByLabel('6-digit code').fill(await freshCode(secret, email));
    await page.getByRole('button', { name: 'Turn on and sign in' }).click();
  } else {
    if (!secret) fail('This account already has an authenticator; pass its secret.');
    await page.getByLabel('6-digit code').fill(await freshCode(secret, email));
    await page.getByRole('button', { name: 'Sign in' }).click();
  }
  await page.waitForURL((url) => !url.pathname.startsWith('/login/verify') && !url.pathname.startsWith('/login/setup'));
  return secret!;
}
