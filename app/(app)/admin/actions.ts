'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { connectDB } from '@/lib/db';
import { currentUser } from '@/lib/auth/guards';
import { requestInfo } from '@/lib/request-info';
import { createUser, resetAuthenticator, resetPassword, setUserActive, unlockUser, updateUser, type Result } from '@/lib/users';
import { Lab } from '@/models/Lab';

export type ActionResult = Result<{ message?: string; oneTimePassword?: string }>;

const NOT_ALLOWED: ActionResult = { ok: false, error: 'Your session ended or your role changed. Sign in again.' };

// ---- Lab profile ----

const labSchema = z.object({
  name: z.string().trim().min(2, 'Enter the lab name.').max(160),
  licenceNo: z.string().trim().max(60),
  address: z.string().trim().max(300),
  phone: z.string().trim().max(40),
  email: z.union([z.literal(''), z.string().trim().email('Enter a valid email address.').max(200)]),
  reportHeader: z.string().trim().max(500),
});

export async function saveLabAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const actor = await currentUser(['admin']);
  if (!actor) return NOT_ALLOWED;
  const parsed = labSchema.safeParse(Object.fromEntries(['name', 'licenceNo', 'address', 'phone', 'email', 'reportHeader'].map((k) => [k, formData.get(k) ?? ''])));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, fieldErrors };
  }
  await connectDB();
  const before = await Lab.findById(actor.labId).lean();
  await Lab.updateOne({ _id: actor.labId }, { $set: parsed.data });
  const { ip } = await requestInfo();
  await audit({ action: 'lab.updated', labId: actor.labId, userId: actor.id, entity: 'Lab', entityId: actor.labId, before, after: parsed.data, ip });
  revalidatePath('/admin/lab');
  return { ok: true, message: 'Lab profile saved. New reports use it straight away.' };
}

// ---- Users ----

function userInput(formData: FormData) {
  return {
    name: formData.get('name'),
    email: formData.get('email'),
    roles: formData.getAll('roles'),
    licenceNo: formData.get('licenceNo') ?? '',
  };
}

export async function createUserAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const actor = await currentUser(['admin']);
  if (!actor) return NOT_ALLOWED;
  const { ip } = await requestInfo();
  const result = await createUser(actor, userInput(formData), ip);
  if (!result.ok) return result;
  revalidatePath('/admin/users');
  return { ok: true, oneTimePassword: result.oneTimePassword, message: `${String(formData.get('name'))} can now sign in.` };
}

export async function updateUserAction(userId: string, _prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const actor = await currentUser(['admin']);
  if (!actor) return NOT_ALLOWED;
  const { ip } = await requestInfo();
  const result = await updateUser(actor, userId, userInput(formData), ip);
  if (!result.ok) return result;
  revalidatePath('/admin/users');
  return { ok: true, message: 'Saved. If their roles changed, they were signed out and see the new access at next sign-in.' };
}

type AccountStep = 'reset-password' | 'reset-authenticator' | 'unlock' | 'switch-off' | 'switch-on';

export async function accountStepAction(userId: string, step: AccountStep): Promise<ActionResult> {
  const actor = await currentUser(['admin']);
  if (!actor) return NOT_ALLOWED;
  const { ip } = await requestInfo();
  let result: ActionResult;
  switch (step) {
    case 'reset-password': {
      const r = await resetPassword(actor, userId, ip);
      result = r.ok ? { ok: true, oneTimePassword: r.oneTimePassword, message: 'Password reset. They were signed out everywhere.' } : r;
      break;
    }
    case 'reset-authenticator': {
      const r = await resetAuthenticator(actor, userId, ip);
      result = r.ok ? { ok: true, message: 'Authenticator reset. They set up a new one at next sign-in.' } : r;
      break;
    }
    case 'unlock': {
      const r = await unlockUser(actor, userId, ip);
      result = r.ok ? { ok: true, message: 'Unlocked. They can try signing in again now.' } : r;
      break;
    }
    case 'switch-off':
    case 'switch-on': {
      const on = step === 'switch-on';
      const r = await setUserActive(actor, userId, on, ip);
      result = r.ok ? { ok: true, message: on ? 'Switched on. They can sign in again.' : 'Switched off and signed out everywhere.' } : r;
      break;
    }
    default:
      result = { ok: false, error: 'Unknown step.' };
  }
  if (result.ok) revalidatePath('/admin/users');
  return result;
}
