import 'server-only';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { randomToken, sha256 } from '@/lib/crypto';
import { Session } from '@/models/Session';
import { User, type UserDoc } from '@/models/User';

// Session rules (docs/PLAN.md §6): 12 hours at most, ends after 30 minutes idle.
// A session waiting for the TOTP code lasts 10 minutes.
export const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_MFA_MS = 10 * 60 * 1000;
const TOUCH_EVERY_MS = 60 * 1000;

export type SessionStage = 'mfa' | 'full';

export type SessionUser = {
  id: string;
  labId: string;
  name: string;
  email: string;
  roles: string[];
  licenceNo: string | null;
  totpEnabled: boolean;
  mustChangePassword: boolean;
};

export type ActiveSession = { sessionId: string; stage: SessionStage; user: SessionUser; expiresAt: Date };

export async function createSession(input: {
  userId: Types.ObjectId | string;
  labId: Types.ObjectId | string;
  stage: SessionStage;
  ip?: string;
  userAgent?: string;
  now?: Date;
}): Promise<{ token: string; expiresAt: Date }> {
  await connectDB();
  const now = input.now ?? new Date();
  const token = randomToken(32);
  const expiresAt = new Date(now.getTime() + (input.stage === 'mfa' ? SESSION_MFA_MS : SESSION_ABSOLUTE_MS));
  await Session.create({
    tokenHash: sha256(token),
    userId: input.userId,
    labId: input.labId,
    stage: input.stage,
    createdAt: now,
    lastSeenAt: now,
    expiresAt,
    ip: input.ip,
    userAgent: input.userAgent?.slice(0, 300),
  });
  return { token, expiresAt };
}

export function toSessionUser(user: Pick<UserDoc, '_id' | 'labId' | 'name' | 'email' | 'roles' | 'licenceNo' | 'totpSecretEnc' | 'mustChangePassword'>): SessionUser {
  return {
    id: String(user._id),
    labId: String(user.labId),
    name: user.name,
    email: user.email,
    roles: [...(user.roles ?? [])],
    licenceNo: user.licenceNo ?? null,
    totpEnabled: !!user.totpSecretEnc,
    mustChangePassword: !!user.mustChangePassword,
  };
}

/** The session behind a cookie token, or null when it is unknown, expired, idle too long, or its user is inactive. */
export async function findSession(token: string | undefined | null, now = new Date()): Promise<ActiveSession | null> {
  if (!token || token.length > 100) return null;
  await connectDB();
  const session = await Session.findOne({ tokenHash: sha256(token) }).lean();
  if (!session) return null;
  const idleFor = now.getTime() - new Date(session.lastSeenAt).getTime();
  if (session.expiresAt <= now || (session.stage === 'full' && idleFor > SESSION_IDLE_MS)) {
    await Session.deleteOne({ _id: session._id });
    return null;
  }
  const user = await User.findById(session.userId)
    .select('labId name email roles licenceNo totpSecretEnc mustChangePassword active')
    .lean();
  if (!user || !user.active) {
    await Session.deleteOne({ _id: session._id });
    return null;
  }
  if (idleFor > TOUCH_EVERY_MS) {
    await Session.updateOne({ _id: session._id }, { $set: { lastSeenAt: now } });
  }
  return { sessionId: String(session._id), stage: session.stage as SessionStage, user: toSessionUser(user), expiresAt: session.expiresAt };
}

export async function deleteSession(token: string | undefined | null): Promise<void> {
  if (!token) return;
  await connectDB();
  await Session.deleteOne({ tokenHash: sha256(token) });
}

/** Sign a user out everywhere (password change, deactivation, role change). */
export async function deleteUserSessions(userId: Types.ObjectId | string): Promise<number> {
  await connectDB();
  const result = await Session.deleteMany({ userId });
  return result.deletedCount;
}
