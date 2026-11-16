import { describe, expect, it } from 'vitest';
import { generate } from 'otplib';
import { setupTestDb } from '../helpers/db';
import { TEST_PASSWORD, makeLab, makeUser } from '../helpers/factories';
import {
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  SESSION_MFA_MS,
  createSession,
  deleteUserSessions,
  findSession,
} from '@/lib/auth/session-store';
import {
  LOCK_AFTER_FAILURES,
  LOCK_MS,
  checkCredentials,
  checkSecondFactor,
  confirmTotpEnrolment,
  pendingTotpSecret,
  startTotpEnrolment,
} from '@/lib/auth/sign-in';
import { sha256 } from '@/lib/crypto';
import { Session } from '@/models/Session';
import { User } from '@/models/User';

setupTestDb();

const at = (iso: string) => new Date(iso);

describe('sessions', () => {
  it('stores only a hash of the token and finds the session by the token', async () => {
    const lab = await makeLab();
    const { user } = await makeUser(lab._id);
    const now = at('2026-11-16T01:00:00Z');
    const { token, expiresAt } = await createSession({ userId: user._id, labId: lab._id, stage: 'full', now });
    expect(expiresAt.getTime() - now.getTime()).toBe(SESSION_ABSOLUTE_MS);
    expect(await Session.countDocuments({ tokenHash: token })).toBe(0);
    expect(await Session.countDocuments({ tokenHash: sha256(token) })).toBe(1);
    const found = await findSession(token, now);
    expect(found?.user.email).toBe('maria@lab.test');
    expect(found?.stage).toBe('full');
  });

  it('ends a signed-in session after 30 minutes idle', async () => {
    const lab = await makeLab();
    const { user } = await makeUser(lab._id);
    const now = at('2026-11-16T01:00:00Z');
    const { token } = await createSession({ userId: user._id, labId: lab._id, stage: 'full', now });
    expect(await findSession(token, new Date(now.getTime() + SESSION_IDLE_MS - 1000))).not.toBeNull();
    // Activity just now moved lastSeenAt forward, so measure idle from there.
    const last = new Date(now.getTime() + SESSION_IDLE_MS - 1000);
    expect(await findSession(token, new Date(last.getTime() + SESSION_IDLE_MS + 1000))).toBeNull();
    expect(await Session.countDocuments()).toBe(0);
  });

  it('ends any session at its absolute expiry even when active', async () => {
    const lab = await makeLab();
    const { user } = await makeUser(lab._id);
    const now = at('2026-11-16T01:00:00Z');
    const { token } = await createSession({ userId: user._id, labId: lab._id, stage: 'mfa', now });
    expect(await findSession(token, new Date(now.getTime() + SESSION_MFA_MS + 1))).toBeNull();
  });

  it('refuses a session whose user has been switched off', async () => {
    const lab = await makeLab();
    const { user } = await makeUser(lab._id);
    const { token } = await createSession({ userId: user._id, labId: lab._id, stage: 'full' });
    await User.updateOne({ _id: user._id }, { active: false });
    expect(await findSession(token)).toBeNull();
  });

  it('signs a user out everywhere', async () => {
    const lab = await makeLab();
    const { user } = await makeUser(lab._id);
    await createSession({ userId: user._id, labId: lab._id, stage: 'full' });
    await createSession({ userId: user._id, labId: lab._id, stage: 'full' });
    expect(await deleteUserSessions(user._id)).toBe(2);
  });

  it('ignores junk tokens', async () => {
    expect(await findSession(undefined)).toBeNull();
    expect(await findSession('x'.repeat(500))).toBeNull();
    expect(await findSession('not-a-real-token')).toBeNull();
  });
});

describe('password step', () => {
  it('accepts the right password, case-insensitive email', async () => {
    const lab = await makeLab();
    await makeUser(lab._id);
    const result = await checkCredentials('  MARIA@lab.test ', TEST_PASSWORD);
    expect(result.ok).toBe(true);
  });

  it('gives the same answer for an unknown email and a wrong password', async () => {
    const lab = await makeLab();
    await makeUser(lab._id);
    expect(await checkCredentials('nobody@lab.test', TEST_PASSWORD)).toEqual({ ok: false, reason: 'invalid' });
    expect(await checkCredentials('maria@lab.test', 'wrong password!')).toEqual({ ok: false, reason: 'invalid' });
  });

  it(`locks the account for 15 minutes after ${LOCK_AFTER_FAILURES} wrong passwords`, async () => {
    const lab = await makeLab();
    await makeUser(lab._id);
    const now = at('2026-11-16T01:00:00Z');
    for (let i = 1; i < LOCK_AFTER_FAILURES; i++) {
      expect((await checkCredentials('maria@lab.test', 'wrong', now)).ok).toBe(false);
    }
    const fifth = await checkCredentials('maria@lab.test', 'wrong', now);
    expect(fifth).toMatchObject({ ok: false, reason: 'locked' });
    // Even the right password is refused while locked.
    expect(await checkCredentials('maria@lab.test', TEST_PASSWORD, new Date(now.getTime() + LOCK_MS - 1000))).toMatchObject({ reason: 'locked' });
    // And accepted once the lock has passed.
    expect((await checkCredentials('maria@lab.test', TEST_PASSWORD, new Date(now.getTime() + LOCK_MS + 1000))).ok).toBe(true);
  });

  it('refuses a switched-off account only after the right password', async () => {
    const lab = await makeLab();
    await makeUser(lab._id, { active: false });
    expect(await checkCredentials('maria@lab.test', 'wrong')).toEqual({ ok: false, reason: 'invalid' });
    expect(await checkCredentials('maria@lab.test', TEST_PASSWORD)).toEqual({ ok: false, reason: 'inactive' });
  });
});

describe('authenticator step', () => {
  it('accepts the current code once, then refuses the same code again', async () => {
    const lab = await makeLab();
    const { user, totpSecret } = await makeUser(lab._id);
    const code = await generate({ secret: totpSecret! });
    expect(await checkSecondFactor(user._id, code)).toEqual({ ok: true });
    expect(await checkSecondFactor(user._id, code)).toMatchObject({ ok: false, reason: 'invalid' });
    const after = await User.findById(user._id).lean();
    expect(after?.lastLoginAt).toBeInstanceOf(Date);
  });

  it('refuses a wrong code and counts it toward the lock', async () => {
    const lab = await makeLab();
    const { user } = await makeUser(lab._id);
    expect(await checkSecondFactor(user._id, '000000')).toMatchObject({ ok: false });
    expect((await User.findById(user._id).lean())?.failedLogins).toBe(1);
  });

  it('accepts codes typed with spaces', async () => {
    const lab = await makeLab();
    const { user, totpSecret } = await makeUser(lab._id);
    const code = await generate({ secret: totpSecret! });
    expect(await checkSecondFactor(user._id, `${code.slice(0, 3)} ${code.slice(3)}`)).toEqual({ ok: true });
  });
});

describe('authenticator enrolment', () => {
  it('keeps the secret aside until a code from it is confirmed', async () => {
    const lab = await makeLab();
    const { user } = await makeUser(lab._id, { totp: false });
    const secret = await startTotpEnrolment(user._id);
    expect(await pendingTotpSecret(user._id)).toBe(secret);
    expect((await User.findById(user._id).lean())?.totpSecretEnc).toBeUndefined();

    expect(await confirmTotpEnrolment(user._id, '000000')).toMatchObject({ ok: false });
    expect(await confirmTotpEnrolment(user._id, await generate({ secret }))).toEqual({ ok: true });

    const enrolled = await User.findById(user._id).lean();
    expect(enrolled?.totpSecretEnc).toBeTruthy();
    expect(enrolled?.totpPendingSecretEnc).toBeUndefined();
  });
});
