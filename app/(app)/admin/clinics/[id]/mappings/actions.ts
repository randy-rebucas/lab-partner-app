'use server';

import { revalidatePath } from 'next/cache';
import { currentUser } from '@/lib/auth/guards';
import { addCommonNames, addMapping, removeMapping } from '@/lib/catalog/mappings';
import { requestInfo } from '@/lib/request-info';
import type { Result } from '@/lib/users';

export type MappingActionResult = Result<{ message?: string }>;

const NOT_ALLOWED: MappingActionResult = { ok: false, error: 'Your session ended or your role changed. Sign in again.' };

export async function addMappingAction(clinicId: string, _prev: MappingActionResult | undefined, formData: FormData): Promise<MappingActionResult> {
  const actor = await currentUser(['admin']);
  if (!actor) return NOT_ALLOWED;
  const { ip } = await requestInfo();
  const input = Object.fromEntries(['clinicTestType', 'clinicTestCode', 'testId'].map((k) => [k, String(formData.get(k) ?? '')]));
  const r = await addMapping(actor, clinicId, input, ip);
  if (!r.ok) return r;
  revalidatePath(`/admin/clinics/${clinicId}/mappings`);
  return { ok: true, message: `Added. Orders for “${input.clinicTestType || input.clinicTestCode}” are accepted from now on.` };
}

export async function removeMappingAction(clinicId: string, mappingId: string): Promise<MappingActionResult> {
  const actor = await currentUser(['admin']);
  if (!actor) return NOT_ALLOWED;
  const { ip } = await requestInfo();
  const r = await removeMapping(actor, clinicId, mappingId, ip);
  if (!r.ok) return r;
  revalidatePath(`/admin/clinics/${clinicId}/mappings`);
  return { ok: true, message: 'Removed. New orders under that name are refused as an unknown test.' };
}

export async function addCommonNamesAction(clinicId: string): Promise<MappingActionResult> {
  const actor = await currentUser(['admin']);
  if (!actor) return NOT_ALLOWED;
  const { ip } = await requestInfo();
  const r = await addCommonNames(actor, clinicId, ip);
  if (!r.ok) return r;
  revalidatePath(`/admin/clinics/${clinicId}/mappings`);
  return { ok: true, message: r.added ? `Added ${r.added} common names.` : 'This clinic already has every common name.' };
}
