import 'server-only';
import { randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { connectDB } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { ROLES, type Role } from '@/lib/auth/roles';
import { deleteUserSessions, type SessionUser } from '@/lib/auth/session-store';
import { User, type UserDoc } from '@/models/User';

// User management rules (FR-19). Every function checks the rules itself, so a server action
// can't skip one, and every change is written to the audit log.

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error?: string; fieldErrors?: Record<string, string> };

export type UserState = 'can-sign-in' | 'locked' | 'not-set-up' | 'off';

export function userState(u: Pick<UserDoc, 'active' | 'lockedUntil' | 'totpSecretEnc'>, now = new Date()): UserState {
  if (!u.active) return 'off';
  if (u.lockedUntil && u.lockedUntil > now) return 'locked';
  if (!u.totpSecretEnc) return 'not-set-up';
  return 'can-sign-in';
}

/** A password to read out or hand over once; the user must replace it at first sign-in. */
function oneTimePassword(): string {
  return randomBytes(12).toString('base64url');
}

const userFields = z.object({
  name: z.string().trim().min(2, 'Enter the person\'s full name.').max(120),
  roles: z.array(z.enum(ROLES)).min(1, 'Choose at least one role.'),
  licenceNo: z.string().trim().max(40).optional().transform((v) => v || undefined),
});

const newUserFields = userFields.extend({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(200),
});

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0])] ??= issue.message;
  return out;
}

function licenceRule(roles: readonly Role[], licenceNo?: string): Record<string, string> | null {
  return roles.includes('signatory') && !licenceNo ? { licenceNo: 'A signatory needs a licence number: it is printed on every report they release.' } : null;
}

async function activeAdminCount(labId: string, exceptId?: string): Promise<number> {
  return User.countDocuments({
    labId,
    active: true,
    roles: 'admin',
    ...(exceptId ? { _id: { $ne: new Types.ObjectId(exceptId) } } : {}),
  });
}

function snapshot(u: Pick<UserDoc, 'name' | 'email' | 'roles' | 'licenceNo' | 'active'>) {
  return { name: u.name, email: u.email, roles: [...(u.roles ?? [])], licenceNo: u.licenceNo ?? null, active: u.active };
}

export async function createUser(
  actor: SessionUser,
  input: unknown,
  ip?: string
): Promise<Result<{ userId: string; oneTimePassword: string }>> {
  const parsed = newUserFields.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const data = parsed.data;
  const licence = licenceRule(data.roles, data.licenceNo);
  if (licence) return { ok: false, fieldErrors: licence };

  await connectDB();
  if (await User.exists({ labId: actor.labId, email: data.email })) {
    return { ok: false, fieldErrors: { email: 'Someone here already uses this email.' } };
  }
  const password = oneTimePassword();
  const user = await User.create({
    labId: actor.labId,
    name: data.name,
    email: data.email,
    roles: data.roles,
    licenceNo: data.licenceNo,
    passwordHash: await hashPassword(password),
    mustChangePassword: true,
  });
  await audit({ action: 'user.created', labId: actor.labId, userId: actor.id, entity: 'User', entityId: user._id, after: snapshot(user), ip });
  return { ok: true, userId: String(user._id), oneTimePassword: password };
}

export async function updateUser(actor: SessionUser, userId: string, input: unknown, ip?: string): Promise<Result> {
  const parsed = userFields.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const data = parsed.data;
  const licence = licenceRule(data.roles, data.licenceNo);
  if (licence) return { ok: false, fieldErrors: licence };

  await connectDB();
  const user = await User.findOne({ _id: userId, labId: actor.labId }).lean<UserDoc>();
  if (!user) return { ok: false, error: 'That person is no longer on the list.' };

  const losesAdmin = user.roles.includes('admin') && !data.roles.includes('admin');
  if (losesAdmin && userId === actor.id) return { ok: false, fieldErrors: { roles: "You can't take away your own admin role. Ask another admin." } };
  if (losesAdmin && user.active && (await activeAdminCount(actor.labId, userId)) === 0) {
    return { ok: false, fieldErrors: { roles: 'The lab needs at least one admin. Give someone else the admin role first.' } };
  }

  const rolesChanged = [...user.roles].sort().join() !== [...data.roles].sort().join();
  await User.updateOne({ _id: userId }, { $set: { name: data.name, roles: data.roles, licenceNo: data.licenceNo }, ...(data.licenceNo ? {} : { $unset: { licenceNo: 1 } }) });
  // A change of role takes effect at once: their open sessions end (not your own).
  if (rolesChanged && userId !== actor.id) await deleteUserSessions(userId);
  await audit({
    action: 'user.updated',
    labId: actor.labId,
    userId: actor.id,
    entity: 'User',
    entityId: userId,
    before: snapshot(user),
    after: { ...snapshot(user), name: data.name, roles: data.roles, licenceNo: data.licenceNo ?? null },
    ip,
  });
  return { ok: true };
}

export async function resetPassword(actor: SessionUser, userId: string, ip?: string): Promise<Result<{ oneTimePassword: string }>> {
  await connectDB();
  const user = await User.findOne({ _id: userId, labId: actor.labId }).select('_id').lean();
  if (!user) return { ok: false, error: 'That person is no longer on the list.' };
  if (userId === actor.id) return { ok: false, error: 'Change your own password from your menu instead.' };
  const password = oneTimePassword();
  await User.updateOne(
    { _id: userId },
    { $set: { passwordHash: await hashPassword(password), mustChangePassword: true, failedLogins: 0 }, $unset: { lockedUntil: 1 } }
  );
  await deleteUserSessions(userId);
  await audit({ action: 'user.password-reset', labId: actor.labId, userId: actor.id, entity: 'User', entityId: userId, ip });
  return { ok: true, oneTimePassword: password };
}

export async function resetAuthenticator(actor: SessionUser, userId: string, ip?: string): Promise<Result> {
  await connectDB();
  const user = await User.findOne({ _id: userId, labId: actor.labId }).select('_id').lean();
  if (!user) return { ok: false, error: 'That person is no longer on the list.' };
  if (userId === actor.id) return { ok: false, error: 'Ask another admin to reset your own authenticator.' };
  await User.updateOne({ _id: userId }, { $unset: { totpSecretEnc: 1, totpPendingSecretEnc: 1, totpLastCode: 1, totpLastAt: 1 } });
  await deleteUserSessions(userId);
  await audit({ action: 'user.authenticator-reset', labId: actor.labId, userId: actor.id, entity: 'User', entityId: userId, ip });
  return { ok: true };
}

export async function unlockUser(actor: SessionUser, userId: string, ip?: string): Promise<Result> {
  await connectDB();
  const result = await User.updateOne({ _id: userId, labId: actor.labId }, { $set: { failedLogins: 0 }, $unset: { lockedUntil: 1 } });
  if (!result.matchedCount) return { ok: false, error: 'That person is no longer on the list.' };
  await audit({ action: 'user.unlocked', labId: actor.labId, userId: actor.id, entity: 'User', entityId: userId, ip });
  return { ok: true };
}

export async function setUserActive(actor: SessionUser, userId: string, active: boolean, ip?: string): Promise<Result> {
  await connectDB();
  const user = await User.findOne({ _id: userId, labId: actor.labId }).lean<UserDoc>();
  if (!user) return { ok: false, error: 'That person is no longer on the list.' };
  if (!active && userId === actor.id) return { ok: false, error: "You can't switch off your own account." };
  if (!active && user.roles.includes('admin') && (await activeAdminCount(actor.labId, userId)) === 0) {
    return { ok: false, error: 'The lab needs at least one admin who can sign in. Give someone else the admin role first.' };
  }
  await User.updateOne({ _id: userId }, { $set: { active } });
  if (!active) await deleteUserSessions(userId);
  await audit({
    action: active ? 'user.switched-on' : 'user.switched-off',
    labId: actor.labId,
    userId: actor.id,
    entity: 'User',
    entityId: userId,
    before: { active: user.active },
    after: { active },
    ip,
  });
  return { ok: true };
}
