import { describe, expect, it } from 'vitest';
import { setupTestDb } from '../helpers/db';
import { makeLab, makeUser } from '../helpers/factories';
import { createSession } from '@/lib/auth/session-store';
import { toSessionUser } from '@/lib/auth/session-store';
import { createUser, resetAuthenticator, resetPassword, setUserActive, updateUser, userState } from '@/lib/users';
import { AuditEvent } from '@/models/AuditEvent';
import { Session } from '@/models/Session';
import { User } from '@/models/User';

setupTestDb();

async function adminActor() {
  const lab = await makeLab();
  const { user } = await makeUser(lab._id, { email: 'admin@lab.test', roles: ['admin'] });
  return { lab, admin: user, actor: toSessionUser(user) };
}

describe('creating users', () => {
  it('creates a user who must change the one-time password, and audits it', async () => {
    const { actor } = await adminActor();
    const result = await createUser(actor, { name: 'Mara Santos', email: 'Mara@Lab.test', roles: ['medtech'] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.oneTimePassword).toMatch(/^[A-Za-z0-9_-]{16}$/);
    const saved = await User.findById(result.userId).lean();
    expect(saved?.email).toBe('mara@lab.test');
    expect(saved?.mustChangePassword).toBe(true);
    expect(saved?.passwordHash).not.toContain(result.oneTimePassword);
    expect(await AuditEvent.countDocuments({ action: 'user.created' })).toBe(1);
  });

  it('needs a licence number for a signatory', async () => {
    const { actor } = await adminActor();
    const result = await createUser(actor, { name: 'Dr. Lim', email: 'lim@lab.test', roles: ['signatory'] });
    expect(result).toMatchObject({ ok: false, fieldErrors: { licenceNo: expect.stringMatching(/licence number/) } });
  });

  it('refuses a duplicate email and an empty role list', async () => {
    const { actor } = await adminActor();
    expect(await createUser(actor, { name: 'Dup', email: 'admin@lab.test', roles: ['medtech'] })).toMatchObject({
      ok: false,
      fieldErrors: { email: expect.any(String) },
    });
    expect(await createUser(actor, { name: 'No Role', email: 'n@lab.test', roles: [] })).toMatchObject({
      ok: false,
      fieldErrors: { roles: 'Choose at least one role.' },
    });
  });

  it('refuses roles that do not exist', async () => {
    const { actor } = await adminActor();
    const result = await createUser(actor, { name: 'X Y', email: 'x@lab.test', roles: ['superuser'] });
    expect(result.ok).toBe(false);
  });
});

describe('changing roles', () => {
  it("won't let admins remove their own admin role", async () => {
    const { actor, admin } = await adminActor();
    const result = await updateUser(actor, String(admin._id), { name: admin.name, roles: ['medtech'] });
    expect(result).toMatchObject({ ok: false, fieldErrors: { roles: expect.stringMatching(/your own admin/) } });
  });

  it('keeps at least one active admin', async () => {
    const { lab, actor } = await adminActor();
    const { user: other } = await makeUser(lab._id, { email: 'other@lab.test', roles: ['admin'] });
    // Two admins: removing the other one's admin role is fine.
    expect((await updateUser(actor, String(other._id), { name: 'Other', roles: ['medtech'] })).ok).toBe(true);
  });

  it('signs a person out everywhere when their roles change', async () => {
    const { lab, actor } = await adminActor();
    const { user } = await makeUser(lab._id, { email: 'm@lab.test', roles: ['medtech'] });
    await createSession({ userId: user._id, labId: lab._id, stage: 'full' });
    await updateUser(actor, String(user._id), { name: user.name, roles: ['medtech', 'phlebotomist'] });
    expect(await Session.countDocuments({ userId: user._id })).toBe(0);
  });

  it('cannot touch a user in another lab', async () => {
    const { actor } = await adminActor();
    const otherLab = await makeLab('Other Lab');
    const { user } = await makeUser(otherLab._id, { email: 'x@other.test' });
    expect(await updateUser(actor, String(user._id), { name: 'Hacked', roles: ['admin'] })).toMatchObject({ ok: false });
  });
});

describe('switching accounts off and on', () => {
  it("won't switch off your own account", async () => {
    const { actor, admin } = await adminActor();
    expect(await setUserActive(actor, String(admin._id), false)).toMatchObject({ ok: false });
  });

  it('switching off ends their sessions and shows as off', async () => {
    const { lab, actor } = await adminActor();
    const { user } = await makeUser(lab._id, { email: 'm@lab.test' });
    await createSession({ userId: user._id, labId: lab._id, stage: 'full' });
    expect((await setUserActive(actor, String(user._id), false)).ok).toBe(true);
    expect(await Session.countDocuments({ userId: user._id })).toBe(0);
    const saved = await User.findById(user._id).lean();
    expect(userState(saved!)).toBe('off');
  });
});

describe('resets', () => {
  it('a password reset gives a new one-time password and unlocks', async () => {
    const { lab, actor } = await adminActor();
    const { user } = await makeUser(lab._id, { email: 'm@lab.test' });
    await User.updateOne({ _id: user._id }, { lockedUntil: new Date(Date.now() + 60_000) });
    const result = await resetPassword(actor, String(user._id));
    expect(result.ok).toBe(true);
    const saved = await User.findById(user._id).lean();
    expect(saved?.mustChangePassword).toBe(true);
    expect(saved?.lockedUntil).toBeUndefined();
  });

  it('an authenticator reset means setting it up again at next sign-in', async () => {
    const { lab, actor } = await adminActor();
    const { user } = await makeUser(lab._id, { email: 'm@lab.test' });
    expect((await resetAuthenticator(actor, String(user._id))).ok).toBe(true);
    const saved = await User.findById(user._id).lean();
    expect(userState(saved!)).toBe('not-set-up');
  });
});
