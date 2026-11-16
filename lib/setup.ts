import 'server-only';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { connectDB } from '@/lib/db';
import { safeEqual } from '@/lib/crypto';
import { hashPassword, passwordProblem } from '@/lib/auth/password';
import { addSampleTests } from '@/lib/catalog/tests';
import type { Result } from '@/lib/users';
import { Counter } from '@/models/Counter';
import { Lab } from '@/models/Lab';
import { User } from '@/models/User';

// First-time setup in the browser: the lab and its first admin, on a database with no lab yet.
// It can run once. On a deployment reachable from the internet, whoever finds an empty install
// first could claim it, so production also needs SETUP_TOKEN from the environment.

const SETUP_LOCK = 'setup:first-run';

export async function needsSetup(): Promise<boolean> {
  await connectDB();
  return !(await Lab.exists({}));
}

/** Production always needs a token; development needs one only when SETUP_TOKEN is set. */
export function setupTokenRequired(env = process.env): boolean {
  return env.NODE_ENV === 'production' || !!env.SETUP_TOKEN;
}

const schema = z
  .object({
    labName: z.string().trim().min(2, 'Enter the lab’s name.').max(160),
    licenceNo: z.string().trim().max(40).optional().transform((v) => v || undefined),
    address: z.string().trim().max(300).optional().transform((v) => v || undefined),
    phone: z.string().trim().max(40).optional().transform((v) => v || undefined),
    name: z.string().trim().min(2, 'Enter your full name.').max(120),
    email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(200),
    password: z.string(),
    confirm: z.string(),
    sampleTests: z.boolean(),
    token: z.string().max(200).optional(),
  })
  .superRefine((v, ctx) => {
    const problem = passwordProblem(v.password, v.email);
    if (problem) ctx.addIssue({ code: 'custom', path: ['password'], message: problem });
    else if (v.password !== v.confirm) ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'The passwords don’t match.' });
  });

export type SetupInput = z.input<typeof schema>;

export async function completeSetup(input: unknown, opts: { ip?: string; env?: NodeJS.ProcessEnv } = {}): Promise<Result<{ userId: string; labId: string }>> {
  const env = opts.env ?? process.env;
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const i of parsed.error.issues) fe[String(i.path[0])] ??= i.message;
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors: fe };
  }
  const v = parsed.data;
  if (setupTokenRequired(env)) {
    if (!env.SETUP_TOKEN) return { ok: false, error: 'Set SETUP_TOKEN in this server’s environment, restart it, then enter that token here.' };
    if (!v.token || !safeEqual(v.token.trim(), env.SETUP_TOKEN)) return { ok: false, fieldErrors: { token: 'That isn’t this server’s setup token.' } };
  }

  await connectDB();
  if (!(await needsSetup())) return { ok: false, error: 'This lab is already set up. Sign in instead.' };
  // Only the first caller gets the lock; a second tab or a second person at the same moment can't.
  const lock = await Counter.findOneAndUpdate({ key: SETUP_LOCK }, { $inc: { seq: 1 } }, { upsert: true, new: true, lean: true });
  if (lock!.seq !== 1) return { ok: false, error: 'Setup is already under way or done. Sign in instead.' };

  try {
    const lab = await Lab.create({ name: v.labName, licenceNo: v.licenceNo, address: v.address, phone: v.phone, email: v.email });
    const user = await User.create({
      labId: lab._id,
      name: v.name,
      email: v.email,
      passwordHash: await hashPassword(v.password),
      roles: ['admin'],
      mustChangePassword: false,
    });
    const samples = v.sampleTests ? await addSampleTests(String(lab._id)) : 0;
    await audit({ action: 'lab.setup', labId: lab._id, userId: user._id, entity: 'Lab', entityId: lab._id, after: { labName: v.labName, admin: v.email, sampleTests: samples }, ip: opts.ip });
    return { ok: true, userId: String(user._id), labId: String(lab._id) };
  } catch (error) {
    // Undo a half-finished setup so it can be tried again.
    await Promise.all([Lab.deleteMany({}), User.deleteMany({}), Counter.deleteOne({ key: SETUP_LOCK })]).catch(() => undefined);
    throw error;
  }
}
