import 'server-only';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import { User, type UserDoc } from '@/models/User';
import { dummyPasswordCheck, verifyPassword } from './password';
import { checkTotp, cleanCode, newTotpSecret } from './totp';

// Lockout (docs/PLAN.md §6): 5 failed tries, password or code, lock the account for 15 minutes.
export const LOCK_AFTER_FAILURES = 5;
export const LOCK_MS = 15 * 60 * 1000;
/** A code accepted once can't be used again inside this window (one code step plus drift). */
const CODE_REUSE_MS = 90 * 1000;

export type Refusal = { ok: false; reason: 'invalid' | 'locked' | 'inactive'; lockedUntil?: Date };

type UserLean = UserDoc;

function lockedNow(user: Pick<UserLean, 'lockedUntil'>, now: Date): boolean {
  return !!user.lockedUntil && user.lockedUntil > now;
}

/** Count a failure; lock the account when the count reaches the limit. Returns the lock end, if locked. */
export async function recordFailure(userId: Types.ObjectId | string, now = new Date()): Promise<Date | undefined> {
  const updated = await User.findOneAndUpdate({ _id: userId }, { $inc: { failedLogins: 1 } }, { new: true })
    .select('failedLogins')
    .lean();
  if (updated && (updated.failedLogins ?? 0) >= LOCK_AFTER_FAILURES) {
    const lockedUntil = new Date(now.getTime() + LOCK_MS);
    await User.updateOne({ _id: userId }, { $set: { lockedUntil, failedLogins: 0 } });
    return lockedUntil;
  }
  return undefined;
}

/** Step 1: email and password. A missing account and a wrong password get the same answer. */
export async function checkCredentials(
  email: string,
  password: string,
  now = new Date()
): Promise<{ ok: true; user: UserLean } | Refusal> {
  await connectDB();
  const user = await User.findOne({ email: email.trim().toLowerCase() }).lean<UserLean>();
  if (!user) {
    await dummyPasswordCheck(password);
    return { ok: false, reason: 'invalid' };
  }
  if (lockedNow(user, now)) return { ok: false, reason: 'locked', lockedUntil: user.lockedUntil ?? undefined };
  const match = await verifyPassword(password, user.passwordHash);
  if (!match) {
    const lockedUntil = await recordFailure(user._id, now);
    return lockedUntil ? { ok: false, reason: 'locked', lockedUntil } : { ok: false, reason: 'invalid' };
  }
  if (!user.active) return { ok: false, reason: 'inactive' };
  return { ok: true, user };
}

/** Step 2: the authenticator code. On success the failure count resets and the sign-in is recorded. */
export async function checkSecondFactor(
  userId: Types.ObjectId | string,
  code: string,
  now = new Date()
): Promise<{ ok: true } | Refusal> {
  await connectDB();
  const user = await User.findById(userId).lean<UserLean>();
  if (!user || !user.active || !user.totpSecretEnc) return { ok: false, reason: 'invalid' };
  if (lockedNow(user, now)) return { ok: false, reason: 'locked', lockedUntil: user.lockedUntil ?? undefined };

  const token = cleanCode(code);
  const reused = user.totpLastCode === token && user.totpLastAt && now.getTime() - user.totpLastAt.getTime() < CODE_REUSE_MS;
  const valid = !reused && (await checkTotp(decryptSecret(user.totpSecretEnc), token));
  if (!valid) {
    const lockedUntil = await recordFailure(user._id, now);
    return lockedUntil ? { ok: false, reason: 'locked', lockedUntil } : { ok: false, reason: 'invalid' };
  }
  await User.updateOne(
    { _id: user._id },
    { $set: { totpLastCode: token, totpLastAt: now, failedLogins: 0, lastLoginAt: now }, $unset: { lockedUntil: 1 } }
  );
  return { ok: true };
}

/** Start (or restart) authenticator enrolment: a new secret is kept aside until confirmed. */
export async function startTotpEnrolment(userId: Types.ObjectId | string): Promise<string> {
  await connectDB();
  const secret = newTotpSecret();
  await User.updateOne({ _id: userId }, { $set: { totpPendingSecretEnc: encryptSecret(secret) } });
  return secret;
}

/** The secret being enrolled, if enrolment was started. */
export async function pendingTotpSecret(userId: Types.ObjectId | string): Promise<string | null> {
  await connectDB();
  const user = await User.findById(userId).select('totpPendingSecretEnc').lean<UserLean>();
  return user?.totpPendingSecretEnc ? decryptSecret(user.totpPendingSecretEnc) : null;
}

/** Confirm enrolment with a code from the app; the pending secret becomes the account's secret. */
export async function confirmTotpEnrolment(
  userId: Types.ObjectId | string,
  code: string,
  now = new Date()
): Promise<{ ok: true } | Refusal> {
  await connectDB();
  const user = await User.findById(userId).lean<UserLean>();
  if (!user || !user.active || !user.totpPendingSecretEnc) return { ok: false, reason: 'invalid' };
  if (lockedNow(user, now)) return { ok: false, reason: 'locked', lockedUntil: user.lockedUntil ?? undefined };
  const valid = await checkTotp(decryptSecret(user.totpPendingSecretEnc), code);
  if (!valid) {
    const lockedUntil = await recordFailure(user._id, now);
    return lockedUntil ? { ok: false, reason: 'locked', lockedUntil } : { ok: false, reason: 'invalid' };
  }
  await User.updateOne(
    { _id: user._id },
    {
      $set: { totpSecretEnc: user.totpPendingSecretEnc, totpLastCode: cleanCode(code), totpLastAt: now, failedLogins: 0, lastLoginAt: now },
      $unset: { totpPendingSecretEnc: 1, lockedUntil: 1 },
    }
  );
  return { ok: true };
}
