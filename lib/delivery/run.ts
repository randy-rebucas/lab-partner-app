import 'server-only';
import { Types } from 'mongoose';
import { audit } from '@/lib/audit';
import { clinicWebhookSecret, platformHostProblem } from '@/lib/clinics';
import { connectDB } from '@/lib/db';
import { systemTransition } from '@/lib/orders/transition';
import { ConnectedClinic } from '@/models/ConnectedClinic';
import { Delivery, type DeliveryDoc } from '@/models/Delivery';
import { Result } from '@/models/Result';
import { classify, nextAttemptAt } from './schedule';
import { signBody } from './sign';

// Sends due results webhooks (FR-15). Called right after a release (via after()) and by the cron
// route every minute. A row is claimed atomically, so two runners never send the same attempt.

export const WEBHOOK_PATH = '/api/lab-results/third-party/webhook';
const TIMEOUT_MS = 15_000;
const LOCK_MS = 60_000;

export type RunSummary = { attempted: number; delivered: number; retrying: number; flagged: number };

async function claim(now: Date, onlyId?: string) {
  return Delivery.findOneAndUpdate(
    {
      ...(onlyId ? { _id: new Types.ObjectId(onlyId) } : {}),
      deliveredAt: null,
      flagged: false,
      nextAttemptAt: { $lte: now },
      $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
    },
    { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) } },
    { new: true, sort: { nextAttemptAt: 1 } }
  ).lean<DeliveryDoc>();
}

async function post(url: string, headers: Record<string, string>, body: string): Promise<{ status: number | null; error?: string }> {
  try {
    const res = await fetch(url, { method: 'POST', headers, body, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
    await res.arrayBuffer().catch(() => undefined);
    return { status: res.status };
  } catch (error) {
    const e = error as Error;
    return { status: null, error: e.name === 'TimeoutError' ? 'No answer within 15 seconds' : `Could not reach the clinic (${e.message})` };
  }
}

async function attempt(d: DeliveryDoc, now: Date): Promise<'delivered' | 'retrying' | 'flagged'> {
  const clinic = await ConnectedClinic.findById(d.clinicId).lean();
  const base = { lockedUntil: null, lastAttemptAt: now, attempts: d.attempts + 1, firstAttemptAt: d.firstAttemptAt ?? now };
  const flag = async (reason: string, status?: number) => {
    await Delivery.updateOne({ _id: d._id }, { $set: { ...base, flagged: true, flagReason: reason, lastStatus: status ?? null, lastError: reason, nextAttemptAt: null } });
    await audit({ action: 'delivery.flagged', labId: d.labId, actor: 'system', entity: 'Delivery', entityId: d._id, after: { resultId: d.resultIdString, reason } });
    return 'flagged' as const;
  };
  if (!clinic) return flag('The clinic is no longer connected.');
  const hostProblem = platformHostProblem(clinic.platformHost);
  if (hostProblem) return flag(`The clinic’s MyClinicSoft address is not allowed: ${hostProblem}`);

  const ts = String(Math.floor(now.getTime() / 1000));
  const reply = await post(
    `${clinic.platformHost}${WEBHOOK_PATH}`,
    {
      'Content-Type': 'application/json',
      'X-Lab-Code': clinic.mcsLabCode,
      'X-Webhook-Timestamp': ts,
      'X-Webhook-Signature': signBody(clinicWebhookSecret(clinic), ts, d.body),
    },
    d.body
  );
  const outcome = classify(reply.status, reply.error);

  if (outcome.kind === 'delivered') {
    await Delivery.updateOne({ _id: d._id }, { $set: { ...base, deliveredAt: now, lastStatus: reply.status, lastError: null, nextAttemptAt: null } });
    await audit({ action: 'delivery.delivered', labId: d.labId, actor: 'system', entity: 'Delivery', entityId: d._id, after: { resultId: d.resultIdString, status: reply.status } });
    // Only the order's newest released version moves it to delivered.
    const newest = await Result.findOne({ orderId: d.orderId, status: 'released' }).sort({ version: -1 }).select('_id').lean();
    if (newest && String(newest._id) === String(d.resultId)) {
      await systemTransition(String(d.orderId), 'delivered', clinic.name, `Result ${d.resultIdString} received by the clinic`);
    }
    return 'delivered';
  }
  if (outcome.kind === 'flag') return flag(outcome.reason, reply.status ?? undefined);

  const next = nextAttemptAt(base.attempts, base.firstAttemptAt, now);
  if (!next) return flag(`No successful answer for 24 hours. Last: ${outcome.reason}`, reply.status ?? undefined);
  await Delivery.updateOne({ _id: d._id }, { $set: { ...base, lastStatus: reply.status, lastError: outcome.reason, nextAttemptAt: next } });
  return 'retrying';
}

/** Send every delivery that is due (or only `onlyId`). Never throws. */
export async function runDueDeliveries(opts: { now?: Date; onlyId?: string; max?: number } = {}): Promise<RunSummary> {
  const summary: RunSummary = { attempted: 0, delivered: 0, retrying: 0, flagged: 0 };
  try {
    await connectDB();
    for (let i = 0; i < (opts.max ?? 50); i++) {
      const now = opts.now ?? new Date();
      const d = await claim(now, opts.onlyId);
      if (!d) break;
      summary.attempted += 1;
      try {
        summary[await attempt(d, now)] += 1;
      } catch (error) {
        console.error('Delivery attempt failed', error);
        await Delivery.updateOne({ _id: d._id }, { $set: { lockedUntil: null, lastError: 'Internal error; will try again', nextAttemptAt: new Date(now.getTime() + 60_000) } });
      }
      if (opts.onlyId) break;
    }
  } catch (error) {
    console.error('Delivery run failed', error);
  }
  return summary;
}

/** Staff asked to try again: a fresh 24-hour window, due now. */
export async function retryDelivery(labId: string, deliveryId: string): Promise<boolean> {
  if (!Types.ObjectId.isValid(deliveryId)) return false;
  await connectDB();
  const r = await Delivery.updateOne(
    { _id: deliveryId, labId, deliveredAt: null },
    { $set: { flagged: false, flagReason: null, nextAttemptAt: new Date(), firstAttemptAt: null, lockedUntil: null } }
  );
  return r.modifiedCount === 1;
}
