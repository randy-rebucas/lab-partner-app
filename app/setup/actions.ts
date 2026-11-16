'use server';

import { redirect } from 'next/navigation';
import { startSession } from '@/lib/auth/session';
import { requestInfo } from '@/lib/request-info';
import { completeSetup } from '@/lib/setup';
import type { Result } from '@/lib/users';

export type SetupResult = Result;

export async function setupAction(_prev: SetupResult | undefined, formData: FormData): Promise<SetupResult> {
  const { ip, userAgent } = await requestInfo();
  const text = (k: string) => String(formData.get(k) ?? '');
  const r = await completeSetup(
    {
      labName: text('labName'),
      licenceNo: text('licenceNo'),
      address: text('address'),
      phone: text('phone'),
      name: text('name'),
      email: text('email'),
      password: text('password'),
      confirm: text('confirm'),
      sampleTests: formData.get('sampleTests') === 'on',
      token: text('token') || undefined,
    },
    { ip }
  );
  if (!r.ok) return r;
  // Signed in as far as the password: the authenticator is set up next, as for every account.
  await startSession({ userId: r.userId, labId: r.labId, stage: 'mfa', ip, userAgent });
  redirect('/login/setup');
}
