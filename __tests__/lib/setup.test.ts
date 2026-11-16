import { describe, expect, it } from 'vitest';
import { setupTestDb } from '../helpers/db';
import { verifyPassword } from '@/lib/auth/password';
import { completeSetup, needsSetup, setupTokenRequired, type SetupInput } from '@/lib/setup';
import { AuditEvent } from '@/models/AuditEvent';
import { Lab } from '@/models/Lab';
import { TestDefinition } from '@/models/TestDefinition';
import { User } from '@/models/User';

setupTestDb();

const dev = { NODE_ENV: 'development' } as NodeJS.ProcessEnv;
const prod = { NODE_ENV: 'production', SETUP_TOKEN: 'long-random-setup-token' } as NodeJS.ProcessEnv;

const input = (over: Partial<SetupInput> = {}): SetupInput => ({
  labName: 'Santos Diagnostic Laboratory',
  licenceNo: '12-345-26-CL-2',
  address: '12 Rizal St, Quezon City',
  phone: '02 8123 4567',
  name: 'Juan Dela Cruz',
  email: 'Juan@SantosLab.ph',
  password: 'a long lab password 2026',
  confirm: 'a long lab password 2026',
  sampleTests: true,
  ...over,
});

describe('first-time setup', () => {
  it('creates the lab, its first admin and the sample tests, once', async () => {
    expect(await needsSetup()).toBe(true);
    const r = await completeSetup(input(), { env: dev });
    expect(r.ok).toBe(true);
    expect(await needsSetup()).toBe(false);
    const user = await User.findOne().lean();
    expect(user).toMatchObject({ email: 'juan@santoslab.ph', roles: ['admin'], mustChangePassword: false });
    expect(user!.totpSecretEnc).toBeFalsy(); // set up at the next step, as for every account
    expect(await verifyPassword('a long lab password 2026', user!.passwordHash)).toBe(true);
    expect(await Lab.findOne().lean()).toMatchObject({ name: 'Santos Diagnostic Laboratory', licenceNo: '12-345-26-CL-2' });
    expect(await TestDefinition.countDocuments({ sample: true })).toBe(5);
    expect(await AuditEvent.countDocuments({ action: 'lab.setup' })).toBe(1);

    const again = await completeSetup(input({ email: 'someone@else.ph' }), { env: dev });
    expect(again).toMatchObject({ ok: false, error: expect.stringMatching(/already set up/) });
    expect(await User.countDocuments()).toBe(1);
  });

  it('two people at once: only one lab', async () => {
    const results = await Promise.all([1, 2, 3].map((i) => completeSetup(input({ email: `admin${i}@lab.ph` }), { env: dev })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await Lab.countDocuments()).toBe(1);
    expect(await User.countDocuments()).toBe(1);
  });

  it('checks the password and every field', async () => {
    expect(await completeSetup(input({ password: 'short', confirm: 'short' }), { env: dev })).toMatchObject({ fieldErrors: { password: expect.stringMatching(/12 characters/) } });
    expect(await completeSetup(input({ confirm: 'different password 2026' }), { env: dev })).toMatchObject({ fieldErrors: { confirm: expect.any(String) } });
    expect(await completeSetup(input({ labName: '', email: 'nope' }), { env: dev })).toMatchObject({ fieldErrors: { labName: expect.any(String), email: expect.any(String) } });
    expect(await completeSetup(input({ sampleTests: false }), { env: dev })).toMatchObject({ ok: true });
    expect(await TestDefinition.countDocuments()).toBe(0);
  });

  it('production needs the server’s setup token', async () => {
    expect(setupTokenRequired(prod)).toBe(true);
    expect(setupTokenRequired(dev)).toBe(false);
    expect(setupTokenRequired({ ...dev, SETUP_TOKEN: 'x' })).toBe(true);
    expect(await completeSetup(input(), { env: { NODE_ENV: 'production' } as NodeJS.ProcessEnv })).toMatchObject({ ok: false, error: expect.stringMatching(/SETUP_TOKEN/) });
    expect(await completeSetup(input({ token: 'guess' }), { env: prod })).toMatchObject({ fieldErrors: { token: expect.any(String) } });
    expect(await completeSetup(input(), { env: prod })).toMatchObject({ fieldErrors: { token: expect.any(String) } });
    expect(await Lab.countDocuments()).toBe(0);
    expect((await completeSetup(input({ token: 'long-random-setup-token' }), { env: prod })).ok).toBe(true);
  });
});
