import 'server-only';
import { Types } from 'mongoose';
import { audit } from '@/lib/audit';
import { connectDB } from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session-store';
import { transitionOrder } from '@/lib/orders/transition';
import type { Result } from '@/lib/users';
import { nextSeq } from '@/models/Counter';
import { Order } from '@/models/Order';
import { Specimen } from '@/models/Specimen';
import { ID_TYPES, manilaInputToDate, SPECIMEN_CONDITIONS, SPECIMEN_REJECT_REASONS } from './specimen-options';

// Check-in (FR-4), collection and labels (FR-5), specimen rejection and recollection (FR-6).

/** YYMMDD-NNNN by the Manila date, with a counter per day. */
export async function newAccessionNo(at = new Date()): Promise<string> {
  const ymd = at.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).replace(/-/g, '').slice(2);
  const n = await nextSeq(`accession:${ymd}`);
  return `${ymd}-${String(n).padStart(4, '0')}`;
}

export async function checkIn(
  actor: SessionUser,
  orderId: string,
  input: { idType: string; nameMatches: boolean; birthDateMatches: boolean; note?: string },
  ip?: string
): Promise<Result> {
  if (!Types.ObjectId.isValid(orderId)) return { ok: false, error: 'That order no longer exists.' };
  const fe: Record<string, string> = {};
  if (!(ID_TYPES as readonly string[]).includes(input.idType)) fe.idType = 'Choose the ID you checked.';
  if (!input.nameMatches) fe.nameMatches = 'Tick this once the name on the ID matches the order.';
  if (!input.birthDateMatches) fe.birthDateMatches = 'Tick this once the birth date on the ID matches the order.';
  if (Object.keys(fe).length) return { ok: false, fieldErrors: fe };
  await connectDB();
  const order = await Order.findOne({ _id: orderId, labId: actor.labId }).select('status').lean();
  if (!order) return { ok: false, error: 'That order no longer exists.' };
  if (order.status === 'received') {
    const accepted = await transitionOrder(actor, orderId, 'accepted', { ip, note: 'Accepted at check-in', expectFrom: ['received'] });
    if (!accepted.ok) return accepted;
  } else if (order.status !== 'accepted') {
    return { ok: false, error: 'This order is past check-in. The page has been updated.' };
  }
  const note = input.note?.trim().slice(0, 200) || undefined;
  await Order.updateOne(
    { _id: orderId, labId: actor.labId },
    { $set: { checkIn: { at: new Date(), userId: actor.id, by: actor.name, idType: input.idType, note } } }
  );
  await audit({ action: 'order.checked-in', labId: actor.labId, userId: actor.id, entity: 'Order', entityId: orderId, after: { idType: input.idType, note }, ip });
  return { ok: true };
}

export async function collectSpecimen(
  actor: SessionUser,
  orderId: string,
  input: { container: string; collectedAt: string; condition: string; note?: string },
  now = new Date(),
  ip?: string
): Promise<Result<{ specimenId: string; accessionNo: string }>> {
  if (!Types.ObjectId.isValid(orderId)) return { ok: false, error: 'That order no longer exists.' };
  const fe: Record<string, string> = {};
  const container = input.container.trim().slice(0, 60);
  if (!container) fe.container = 'Choose the container.';
  const collectedAt = manilaInputToDate(input.collectedAt);
  if (!collectedAt) fe.collectedAt = 'Enter the date and time of collection.';
  else if (collectedAt.getTime() > now.getTime() + 2 * 60_000) fe.collectedAt = 'The collection time can’t be in the future.';
  else if (now.getTime() - collectedAt.getTime() > 3 * 86_400_000) fe.collectedAt = 'That is more than 3 days ago. Check the date.';
  if (!(SPECIMEN_CONDITIONS as readonly string[]).includes(input.condition)) fe.condition = 'Choose the condition.';
  if (Object.keys(fe).length) return { ok: false, fieldErrors: fe };

  await connectDB();
  const order = await Order.findOne({ _id: orderId, labId: actor.labId }).select('status checkIn specimenId').lean();
  if (!order) return { ok: false, error: 'That order no longer exists.' };
  if (order.status !== 'accepted') return { ok: false, error: 'This order isn’t waiting for a specimen. The page has been updated.' };
  if (!order.checkIn?.at) return { ok: false, error: 'Check the patient’s ID first.' };
  const previous = order.specimenId ? await Specimen.findById(order.specimenId).select('status').lean() : null;

  const accessionNo = await newAccessionNo(collectedAt!);
  const specimen = await Specimen.create({
    labId: actor.labId,
    orderId,
    accessionNo,
    container,
    collectedAt,
    collectedById: actor.id,
    collectedBy: actor.name,
    condition: input.condition,
    note: input.note?.trim().slice(0, 200) || undefined,
    recollectOf: previous?.status === 'rejected' ? previous._id : undefined,
  });
  const moved = await transitionOrder(actor, orderId, 'collected', {
    ip,
    note: `Specimen ${accessionNo}${previous?.status === 'rejected' ? ' (recollection)' : ''}`,
    set: { specimenId: specimen._id, accessionNo },
    expectFrom: ['accepted'],
  });
  if (!moved.ok) {
    await Specimen.deleteOne({ _id: specimen._id });
    return moved;
  }
  await audit({ action: 'specimen.collected', labId: actor.labId, userId: actor.id, entity: 'Specimen', entityId: specimen._id, after: { accessionNo, container, condition: input.condition }, ip });
  return { ok: true, specimenId: String(specimen._id), accessionNo };
}

export async function rejectSpecimen(actor: SessionUser, specimenId: string, reason: string, detail: string, ip?: string): Promise<Result> {
  if (!Types.ObjectId.isValid(specimenId)) return { ok: false, error: 'That specimen no longer exists.' };
  if (!(SPECIMEN_REJECT_REASONS as readonly string[]).includes(reason)) return { ok: false, fieldErrors: { reason: 'Choose a reason.' } };
  const d = detail.trim().slice(0, 200);
  if (reason === 'Other' && !d) return { ok: false, fieldErrors: { detail: 'Say what is wrong with the specimen.' } };
  const text = d ? `${reason}: ${d}` : reason;
  await connectDB();
  const s = await Specimen.findOneAndUpdate(
    { _id: specimenId, labId: actor.labId, status: 'collected' },
    { $set: { status: 'rejected', rejectedReason: text, rejectedAt: new Date(), rejectedBy: actor.name } },
    { new: true }
  ).lean();
  if (!s) return { ok: false, error: 'This specimen is already rejected. The page has been updated.' };
  const moved = await transitionOrder(actor, String(s.orderId), 'accepted', {
    ip,
    note: `Specimen ${s.accessionNo} rejected (${text}). Recollect.`,
    expectFrom: ['collected', 'in-progress'],
  });
  if (!moved.ok) {
    await Specimen.updateOne({ _id: specimenId }, { $set: { status: 'collected' }, $unset: { rejectedReason: 1, rejectedAt: 1, rejectedBy: 1 } });
    return { ok: false, error: 'Results for this specimen are already being checked; it can’t be rejected now.' };
  }
  await audit({ action: 'specimen.rejected', labId: actor.labId, userId: actor.id, entity: 'Specimen', entityId: specimenId, after: { reason: text }, ip });
  return { ok: true };
}

/** What a scanned or typed code points at: an accession number, a request code or a lab order id. */
export async function findOrderByCode(labId: string, raw: string): Promise<string | null> {
  const code = raw.trim();
  if (!code || code.length > 64) return null;
  await connectDB();
  if (/^\d{6}-\d{4}$/.test(code)) {
    const s = await Specimen.findOne({ labId, accessionNo: code }).select('orderId').lean();
    if (s) return String(s.orderId);
  }
  const o = await Order.findOne({ labId, $or: [{ requestId: code }, { requestCode: code }] }).select('_id').lean();
  return o ? String(o._id) : null;
}
