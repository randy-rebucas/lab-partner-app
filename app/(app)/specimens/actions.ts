'use server';

import { revalidatePath } from 'next/cache';
import { currentUser } from '@/lib/auth/guards';
import { CAN } from '@/lib/auth/roles';
import { rejectSpecimen } from '@/lib/specimens';
import { requestInfo } from '@/lib/request-info';
import type { Result } from '@/lib/users';

export type SpecimenActionResult = Result<{ message?: string }>;

export async function rejectSpecimenAction(specimenId: string, _prev: SpecimenActionResult | undefined, formData: FormData): Promise<SpecimenActionResult> {
  const actor = await currentUser(CAN.rejectSpecimen);
  if (!actor) return { ok: false, error: 'Your session ended or your role can’t do this. Sign in again or ask an admin.' };
  const { ip } = await requestInfo();
  const r = await rejectSpecimen(actor, specimenId, String(formData.get('reason') ?? ''), String(formData.get('detail') ?? ''), ip);
  revalidatePath('/specimens');
  revalidatePath('/check-in');
  revalidatePath('/orders');
  return r.ok ? { ok: true, message: 'Specimen rejected. The order is back at check-in for a recollection.' } : r;
}
