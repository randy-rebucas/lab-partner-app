'use server';

import { revalidatePath } from 'next/cache';
import { connectDB } from '@/lib/db';
import { currentUser } from '@/lib/auth/guards';
import { createClinic, integrationEntry, rotateApiKey, rotateWebhookSecret, setClinicActive, updateClinic } from '@/lib/clinics';
import { manilaTime, requestInfo } from '@/lib/request-info';
import type { Result } from '@/lib/users';
import { ConnectedClinic } from '@/models/ConnectedClinic';
import { Lab } from '@/models/Lab';

/** What MyClinicSoft support needs, shown once: the LAB_INTEGRATIONS entry as JSON. */
export type ConnectionDetails = { entry: string; note?: string };
export type ClinicActionResult = Result<{ message?: string; details?: ConnectionDetails; clinicId?: string }>;

const NOT_ALLOWED: ClinicActionResult = { ok: false, error: 'Your session ended or your role changed. Sign in again.' };

function fields(formData: FormData) {
  return Object.fromEntries(['name', 'mcsLabCode', 'platformHost', 'mcsTenantId', 'contactName', 'contactPhone'].map((k) => [k, formData.get(k) ?? '']));
}

async function details(labId: string, clinicId: string, apiKey: string, webhookSecret: string): Promise<string> {
  const [lab, clinic] = await Promise.all([Lab.findById(labId).lean(), ConnectedClinic.findById(clinicId).lean()]);
  const entry = integrationEntry({
    labCode: clinic!.mcsLabCode,
    labName: lab?.name ?? 'Lab',
    appUrl: process.env.APP_URL || 'http://localhost:3000',
    apiKey,
    webhookSecret,
    tenantId: clinic!.mcsTenantId ?? undefined,
  });
  return JSON.stringify(entry, null, 2);
}

export async function createClinicAction(_prev: ClinicActionResult | undefined, formData: FormData): Promise<ClinicActionResult> {
  const actor = await currentUser(['admin']);
  if (!actor) return NOT_ALLOWED;
  const { ip } = await requestInfo();
  const result = await createClinic(actor, fields(formData), ip);
  if (!result.ok) return result;
  await connectDB();
  revalidatePath('/admin/clinics');
  return {
    ok: true,
    clinicId: result.clinicId,
    message: `${String(formData.get('name'))} is connected. Orders start arriving once MyClinicSoft adds the entry below.`,
    details: { entry: await details(actor.labId, result.clinicId, result.apiKey, result.webhookSecret) },
  };
}

export async function updateClinicAction(clinicId: string, _prev: ClinicActionResult | undefined, formData: FormData): Promise<ClinicActionResult> {
  const actor = await currentUser(['admin']);
  if (!actor) return NOT_ALLOWED;
  const { ip } = await requestInfo();
  const result = await updateClinic(actor, clinicId, fields(formData), ip);
  if (!result.ok) return result;
  revalidatePath(`/admin/clinics/${clinicId}`);
  return { ok: true, message: 'Saved. A changed lab code or address must also be changed at MyClinicSoft.' };
}

export async function credentialStepAction(clinicId: string, step: 'rotate-key' | 'rotate-secret' | 'switch-off' | 'switch-on'): Promise<ClinicActionResult> {
  const actor = await currentUser(['admin']);
  if (!actor) return NOT_ALLOWED;
  const { ip } = await requestInfo();
  let result: ClinicActionResult;
  if (step === 'rotate-key') {
    const r = await rotateApiKey(actor, clinicId, new Date(), ip);
    result = r.ok
      ? {
          ok: true,
          message: `New API key made. The old key keeps working until ${r.oldKeysUntil.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' })}, ${manilaTime(r.oldKeysUntil)}.`,
          details: { entry: JSON.stringify({ apiKey: r.apiKey }, null, 2), note: 'Give MyClinicSoft support the new apiKey for this lab’s LAB_INTEGRATIONS entry.' },
        }
      : r;
  } else if (step === 'rotate-secret') {
    const r = await rotateWebhookSecret(actor, clinicId, ip);
    result = r.ok
      ? {
          ok: true,
          message: 'New webhook secret in force now. Results to this clinic fail until MyClinicSoft has it; they are retried for 24 hours.',
          details: { entry: JSON.stringify({ webhookSecret: r.webhookSecret }, null, 2), note: 'Give MyClinicSoft support the new webhookSecret straight away.' },
        }
      : r;
  } else {
    const on = step === 'switch-on';
    const r = await setClinicActive(actor, clinicId, on, ip);
    result = r.ok ? { ok: true, message: on ? 'Switched on. Orders from this clinic are accepted again.' : 'Switched off. New orders from this clinic are refused.' } : r;
  }
  if (result.ok) {
    revalidatePath(`/admin/clinics/${clinicId}`);
    revalidatePath('/admin/clinics');
  }
  return result;
}
