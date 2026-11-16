'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { connectDB } from '@/lib/db';
import { hashPassword, passwordProblem, verifyPassword } from '@/lib/auth/password';
import { endSession, getSession, startSession } from '@/lib/auth/session';
import { deleteUserSessions } from '@/lib/auth/session-store';
import { checkCredentials, checkSecondFactor, confirmTotpEnrolment, type Refusal } from '@/lib/auth/sign-in';
import { manilaTime, requestInfo } from '@/lib/request-info';
import { User } from '@/models/User';

export type FormState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

function refusalMessage(r: Refusal, step: 'password' | 'code'): string {
  if (r.reason === 'locked') {
    return r.lockedUntil
      ? `Too many tries. This account is locked until ${manilaTime(r.lockedUntil)}.`
      : 'Too many tries. This account is locked for 15 minutes.';
  }
  if (r.reason === 'inactive') return 'This account is switched off. Ask your lab admin to turn it back on.';
  return step === 'password' ? 'Email or password is wrong.' : 'That code is wrong or has expired. Enter the current code from your app.';
}

const credentialsSchema = z.object({
  email: z.string().trim().email('Enter your email address.').max(200),
  password: z.string().min(1, 'Enter your password.').max(200),
});

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentialsSchema.safeParse({ email: formData.get('email'), password: formData.get('password') });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors };
  }
  const { ip, userAgent } = await requestInfo();
  const result = await checkCredentials(parsed.data.email, parsed.data.password);
  if (!result.ok) {
    await audit({ action: 'sign-in.refused', actor: parsed.data.email.toLowerCase(), after: { reason: result.reason }, ip });
    return { error: refusalMessage(result, 'password') };
  }
  const user = result.user;
  await startSession({ userId: String(user._id), labId: String(user.labId), stage: 'mfa', ip, userAgent });
  await audit({ action: 'sign-in.password-accepted', labId: user.labId, userId: user._id, ip });
  redirect(user.totpSecretEnc ? '/login/verify' : '/login/setup');
}

const codeSchema = z.object({ code: z.string().trim().min(6, 'Enter the 6-digit code.').max(12) });

/** After the code is accepted: swap the waiting session for a full one (a new token, so it can't be fixed in advance). */
async function finishSignIn(userId: string, labId: string, mustChangePassword: boolean, action: string): Promise<never> {
  const { ip, userAgent } = await requestInfo();
  await endSession();
  await startSession({ userId, labId, stage: 'full', ip, userAgent });
  await audit({ action, labId, userId, ip });
  redirect(mustChangePassword ? '/login/password' : '/');
}

export async function verifyCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session || session.stage !== 'mfa') redirect('/login');
  const parsed = codeSchema.safeParse({ code: formData.get('code') });
  if (!parsed.success) return { fieldErrors: { code: parsed.error.issues[0].message } };
  const result = await checkSecondFactor(session.user.id, parsed.data.code);
  if (!result.ok) {
    const { ip } = await requestInfo();
    await audit({ action: 'sign-in.code-refused', labId: session.user.labId, userId: session.user.id, after: { reason: result.reason }, ip });
    if (result.reason === 'locked') await endSession();
    return { error: refusalMessage(result, 'code') };
  }
  return finishSignIn(session.user.id, session.user.labId, session.user.mustChangePassword, 'sign-in.completed');
}

export async function confirmSetupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session || session.stage !== 'mfa') redirect('/login');
  const parsed = codeSchema.safeParse({ code: formData.get('code') });
  if (!parsed.success) return { fieldErrors: { code: parsed.error.issues[0].message } };
  const result = await confirmTotpEnrolment(session.user.id, parsed.data.code);
  if (!result.ok) {
    if (result.reason === 'locked') await endSession();
    return { error: refusalMessage(result, 'code') };
  }
  return finishSignIn(session.user.id, session.user.labId, session.user.mustChangePassword, 'sign-in.authenticator-enrolled');
}

const newPasswordSchema = z.object({
  current: z.string().min(1, 'Enter your current password.').max(200),
  password: z.string().max(200),
  confirm: z.string().max(200),
});

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session || session.stage !== 'full') redirect('/login');
  const parsed = newPasswordSchema.safeParse({
    current: formData.get('current'),
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  });
  if (!parsed.success) return { fieldErrors: { current: parsed.error.issues[0].message } };
  const { current, password, confirm } = parsed.data;
  const problem = passwordProblem(password, session.user.email);
  if (problem) return { fieldErrors: { password: problem } };
  if (password !== confirm) return { fieldErrors: { confirm: "The two passwords don't match." } };

  await connectDB();
  const user = await User.findById(session.user.id).select('passwordHash').lean();
  if (!user || !(await verifyPassword(current, user.passwordHash))) return { fieldErrors: { current: 'Your current password is wrong.' } };
  if (await verifyPassword(password, user.passwordHash)) return { fieldErrors: { password: 'Choose a password you have not used here before.' } };

  await User.updateOne({ _id: session.user.id }, { $set: { passwordHash: await hashPassword(password), mustChangePassword: false } });
  // Every other session ends; this device gets a fresh one.
  await deleteUserSessions(session.user.id);
  const { ip, userAgent } = await requestInfo();
  await startSession({ userId: session.user.id, labId: session.user.labId, stage: 'full', ip, userAgent });
  await audit({ action: 'password.changed', labId: session.user.labId, userId: session.user.id, ip });
  redirect('/');
}

export async function signOutAction(): Promise<void> {
  const session = await getSession();
  if (session) {
    const { ip } = await requestInfo();
    await audit({ action: 'sign-out', labId: session.user.labId, userId: session.user.id, ip });
  }
  await endSession();
  redirect('/login');
}
