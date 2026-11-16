'use server';

import { revalidatePath } from 'next/cache';
import { currentUser } from '@/lib/auth/guards';
import { CAN } from '@/lib/auth/roles';
import { checkIn, collectSpecimen } from '@/lib/specimens';
import { requestInfo } from '@/lib/request-info';
import type { Result } from '@/lib/users';

export type CheckInResult = Result<{ message?: string; specimenId?: string; accessionNo?: string }>;

const NOT_ALLOWED: CheckInResult = { ok: false, error: 'Your session ended or your role can’t do this. Sign in again or ask an admin.' };

function refresh(orderId: string) {
  revalidatePath('/check-in');
  revalidatePath(`/check-in/${orderId}`);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath('/orders');
  revalidatePath('/specimens');
}

export async function checkInAction(orderId: string, _prev: CheckInResult | undefined, formData: FormData): Promise<CheckInResult> {
  const actor = await currentUser(CAN.checkIn);
  if (!actor) return NOT_ALLOWED;
  const { ip } = await requestInfo();
  const r = await checkIn(
    actor,
    orderId,
    {
      idType: String(formData.get('idType') ?? ''),
      nameMatches: formData.get('nameMatches') === 'on',
      birthDateMatches: formData.get('birthDateMatches') === 'on',
      note: String(formData.get('note') ?? ''),
    },
    ip
  );
  refresh(orderId);
  return r.ok ? { ok: true, message: 'Checked in. The specimen can be collected now.' } : r;
}

export async function collectAction(orderId: string, _prev: CheckInResult | undefined, formData: FormData): Promise<CheckInResult> {
  const actor = await currentUser(CAN.collect);
  if (!actor) return NOT_ALLOWED;
  const { ip } = await requestInfo();
  const r = await collectSpecimen(
    actor,
    orderId,
    {
      container: String(formData.get('container') ?? ''),
      collectedAt: String(formData.get('collectedAt') ?? ''),
      condition: String(formData.get('condition') ?? ''),
      note: String(formData.get('note') ?? ''),
    },
    new Date(),
    ip
  );
  refresh(orderId);
  return r.ok ? { ok: true, message: `Collected as ${r.accessionNo}. Print the label and put it on the container now.`, specimenId: r.specimenId, accessionNo: r.accessionNo } : r;
}
