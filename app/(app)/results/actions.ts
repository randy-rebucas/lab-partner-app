'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { currentUser } from '@/lib/auth/guards';
import { runDueDeliveries } from '@/lib/delivery/run';
import { fileStore } from '@/lib/files';
import { requestInfo } from '@/lib/request-info';
import { amendResult, recordCriticalCall, releaseResult, saveResult, sendBack } from '@/lib/results';
import type { Result as R } from '@/lib/users';
import { audit } from '@/lib/audit';
import { connectDB } from '@/lib/db';
import { Result } from '@/models/Result';

export type ResultActionResult = R<{ message?: string }>;

const NOT_ALLOWED: ResultActionResult = { ok: false, error: 'Your session ended or your role can’t do this. Sign in again or ask an admin.' };

function values(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (k.startsWith('v.') && typeof v === 'string') out[k.slice(2)] = v;
  return out;
}

function refresh(orderId: string) {
  for (const p of [`/results/${orderId}`, `/orders/${orderId}`, '/worklists', '/validation', '/orders', '/deliveries', '/']) revalidatePath(p);
}

export async function saveResultAction(orderId: string, _prev: ResultActionResult | undefined, formData: FormData): Promise<ResultActionResult> {
  const actor = await currentUser(['medtech', 'signatory']);
  if (!actor) return NOT_ALLOWED;
  const { ip } = await requestInfo();
  const submit = formData.get('intent') === 'submit';
  const r = await saveResult(actor, orderId, { values: values(formData), interpretation: String(formData.get('interpretation') ?? ''), submit }, ip);
  refresh(orderId);
  if (!r.ok) return r;
  return { ok: true, message: submit ? 'Sent for validation. A signatory other than you releases it.' : 'Draft saved.' };
}

export async function sendBackAction(orderId: string, _prev: ResultActionResult | undefined, formData: FormData): Promise<ResultActionResult> {
  const actor = await currentUser(['signatory']);
  if (!actor) return NOT_ALLOWED;
  const { ip } = await requestInfo();
  const r = await sendBack(actor, orderId, String(formData.get('note') ?? ''), ip);
  refresh(orderId);
  return r.ok ? { ok: true, message: 'Sent back to the bench with your note.' } : r;
}

export async function criticalCallAction(orderId: string, _prev: ResultActionResult | undefined, formData: FormData): Promise<ResultActionResult> {
  const actor = await currentUser(['medtech', 'signatory']);
  if (!actor) return NOT_ALLOWED;
  const { ip } = await requestInfo();
  const r = await recordCriticalCall(
    actor,
    orderId,
    { takenBy: String(formData.get('takenBy') ?? ''), at: String(formData.get('at') ?? ''), note: String(formData.get('note') ?? '') },
    new Date(),
    ip
  );
  refresh(orderId);
  return r.ok ? { ok: true, message: 'Call recorded. The result can be released now.' } : r;
}

export async function releaseAction(orderId: string): Promise<ResultActionResult> {
  const actor = await currentUser(['signatory']);
  if (!actor) return NOT_ALLOWED;
  const { ip } = await requestInfo();
  const r = await releaseResult(actor, orderId, ip);
  if (r.ok) {
    // Send within seconds, after the response; the cron run is the safety net.
    after(() => runDueDeliveries({ onlyId: r.deliveryId }).then(() => undefined));
  }
  refresh(orderId);
  return r.ok ? { ok: true, message: `Released. Report ${r.serial}. Sending to the clinic now.` } : r;
}

export async function amendAction(orderId: string, _prev: ResultActionResult | undefined, formData: FormData): Promise<ResultActionResult> {
  const actor = await currentUser(['medtech', 'signatory']);
  if (!actor) return NOT_ALLOWED;
  const { ip } = await requestInfo();
  const r = await amendResult(actor, orderId, { values: values(formData), interpretation: String(formData.get('interpretation') ?? ''), reason: String(formData.get('reason') ?? '') }, ip);
  refresh(orderId);
  return r.ok ? { ok: true, message: 'Correction sent for validation. Another signatory releases it as a new version.' } : r;
}

/** Remove an attachment while the result is still a draft. */
export async function removeAttachmentAction(orderId: string, fileId: string): Promise<ResultActionResult> {
  const actor = await currentUser(['medtech', 'signatory']);
  if (!actor) return NOT_ALLOWED;
  await connectDB();
  const r = await Result.findOneAndUpdate({ orderId, labId: actor.labId, status: 'draft', 'attachments.fileId': fileId }, { $pull: { attachments: { fileId } } });
  if (!r) return { ok: false, error: 'Attachments can only be removed while the result is a draft.' };
  await fileStore.delete(fileId);
  await audit({ action: 'attachment.removed', labId: actor.labId, userId: actor.id, entity: 'Result', entityId: r._id, after: { fileId } });
  refresh(orderId);
  return { ok: true, message: 'Attachment removed.' };
}
