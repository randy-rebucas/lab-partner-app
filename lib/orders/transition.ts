import 'server-only';
import { Types } from 'mongoose';
import { audit } from '@/lib/audit';
import { connectDB } from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session-store';
import type { Result } from '@/lib/users';
import { Order } from '@/models/Order';
import { canTransition, REJECT_REASONS, STATUS_DISPLAY, type OrderStatus } from './status';

// Every status change goes through here. The update only matches while the order is still in the
// status it was read in, so two people acting at once can't both move it.

export async function transitionOrder(
  actor: SessionUser,
  orderId: string,
  to: OrderStatus,
  opts: { note?: string; set?: Record<string, unknown>; ip?: string; expectFrom?: OrderStatus[] } = {}
): Promise<Result<{ from: OrderStatus }>> {
  if (!Types.ObjectId.isValid(orderId)) return { ok: false, error: 'That order no longer exists.' };
  await connectDB();
  const order = await Order.findOne({ _id: orderId, labId: actor.labId }).select('status requestCode').lean();
  if (!order) return { ok: false, error: 'That order no longer exists.' };
  const from = order.status as OrderStatus;
  if ((opts.expectFrom && !opts.expectFrom.includes(from)) || !canTransition(from, to)) {
    return { ok: false, error: `This order is already ${STATUS_DISPLAY[from].label.toLowerCase()}. The page has been updated.` };
  }
  const now = new Date();
  const updated = await Order.updateOne(
    { _id: orderId, labId: actor.labId, status: from },
    {
      $set: { status: to, ...opts.set },
      $push: { statusHistory: { status: to, at: now, userId: actor.id, by: actor.name, ...(opts.note ? { note: opts.note } : {}) } },
    }
  );
  if (!updated.modifiedCount) return { ok: false, error: 'Someone else changed this order just now. The page has been updated.' };
  await audit({
    action: `order.${to}`,
    labId: actor.labId,
    userId: actor.id,
    entity: 'Order',
    entityId: orderId,
    before: { status: from },
    after: { status: to, ...(opts.note ? { note: opts.note } : {}) },
    ip: opts.ip,
  });
  return { ok: true, from };
}

/** A change made by the system, not a person (a delivery confirmed by the clinic). Same rules. */
export async function systemTransition(orderId: string, to: OrderStatus, by: string, note?: string): Promise<boolean> {
  await connectDB();
  const order = await Order.findById(orderId).select('status labId').lean();
  if (!order) return false;
  const from = order.status as OrderStatus;
  if (!canTransition(from, to)) return false;
  const updated = await Order.updateOne(
    { _id: orderId, status: from },
    { $set: { status: to }, $push: { statusHistory: { status: to, at: new Date(), by, ...(note ? { note } : {}) } } }
  );
  if (!updated.modifiedCount) return false;
  await audit({ action: `order.${to}`, labId: order.labId, actor: by, entity: 'Order', entityId: orderId, before: { status: from }, after: { status: to, note } });
  return true;
}

export async function acceptOrder(actor: SessionUser, orderId: string, ip?: string) {
  return transitionOrder(actor, orderId, 'accepted', { ip, expectFrom: ['received'] });
}

export async function rejectOrder(actor: SessionUser, orderId: string, reason: string, detail: string, ip?: string): Promise<Result> {
  const r = (REJECT_REASONS as readonly string[]).includes(reason) ? reason : '';
  if (!r) return { ok: false, fieldErrors: { reason: 'Choose a reason.' } };
  const d = detail.trim().slice(0, 300);
  if (r === 'Other' && !d) return { ok: false, fieldErrors: { detail: 'Say why, so the clinic knows what to fix.' } };
  const text = d ? `${r}: ${d}` : r;
  return transitionOrder(actor, orderId, 'rejected', { note: text, set: { rejectReason: text }, ip, expectFrom: ['received', 'accepted'] });
}
