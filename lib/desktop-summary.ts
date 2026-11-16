import 'server-only';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { hasAnyRole } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session-store';
import { ConnectedClinic } from '@/models/ConnectedClinic';
import { Delivery } from '@/models/Delivery';
import { Order } from '@/models/Order';
import { Result } from '@/models/Result';

// What the desktop app (lab-partner-desktop) shows in its badge and alerts, for this person's roles.
// Each item has a stable id, so the app alerts once per item and never repeats one it has shown.

export type DesktopItem = {
  id: string;
  kind: 'order' | 'critical' | 'validation' | 'delivery';
  priority: 'urgent' | 'normal';
  title: string;
  body: string;
  /** A path inside the lab app; the desktop app checks it again before opening it. */
  path: string;
  at: string;
};

export type DesktopSummary = {
  counts: { newOrders: number; statOrders: number; toValidate: number; criticalCalls: number; flaggedDeliveries: number };
  /** The number for the taskbar badge: things this person can act on now. */
  badge: number;
  items: DesktopItem[];
};

const LIMIT = 30;
const name = (p?: { lastName?: string | null; firstName?: string | null } | null) => `${p?.lastName ?? ''}, ${p?.firstName ?? ''}`;

export async function desktopSummary(user: SessionUser): Promise<DesktopSummary> {
  await connectDB();
  const labId = new Types.ObjectId(user.labId);
  const r = user.roles;
  const seesOrders = hasAnyRole(r, ['admin', 'front-desk', 'medtech', 'signatory']);
  const validates = hasAnyRole(r, ['admin', 'signatory']);
  const callsCriticals = hasAnyRole(r, ['medtech', 'signatory']);
  const seesDeliveries = hasAnyRole(r, ['admin', 'front-desk', 'signatory']);

  const [orders, awaiting, flagged] = await Promise.all([
    seesOrders ? Order.find({ labId, status: 'received' }).select('patient test.labName urgency clinicId receivedAt').sort({ receivedAt: -1 }).limit(100).lean() : [],
    validates || callsCriticals ? Order.find({ labId, status: 'awaiting-validation' }).select('patient test.labName urgency updatedAt').limit(100).lean() : [],
    seesDeliveries ? Delivery.find({ labId, flagged: true, deliveredAt: null }).select('orderId resultIdString flagReason updatedAt clinicId').limit(50).lean() : [],
  ]);
  const results = awaiting.length
    ? await Result.find({ orderId: { $in: awaiting.map((o) => o._id) }, status: 'submitted' }).select('orderId values.flag criticalCall.at submittedAt').lean()
    : [];
  const clinicIds = [...new Set([...orders, ...flagged].map((x) => String(x.clinicId)))];
  const clinics = new Map((await ConnectedClinic.find({ _id: { $in: clinicIds } }).select('name').lean()).map((c) => [String(c._id), c.name]));
  const flaggedOrders = new Map(
    (await Order.find({ _id: { $in: flagged.map((d) => d.orderId) } }).select('patient').lean()).map((o) => [String(o._id), o])
  );

  const items: DesktopItem[] = [];
  for (const o of orders) {
    const urgent = o.urgency === 'stat' || o.urgency === 'urgent';
    items.push({
      id: `order:${o._id}`,
      kind: 'order',
      priority: urgent ? 'urgent' : 'normal',
      title: urgent ? `${o.urgency === 'stat' ? 'STAT' : 'Urgent'} order: ${o.test?.labName}` : `New order: ${o.test?.labName}`,
      body: `${name(o.patient)} · ${clinics.get(String(o.clinicId)) ?? 'clinic'}`,
      path: `/orders/${o._id}`,
      at: o.receivedAt.toISOString(),
    });
  }
  const orderOf = new Map(awaiting.map((o) => [String(o._id), o]));
  let criticalCalls = 0;
  for (const res of results) {
    const o = orderOf.get(String(res.orderId));
    if (!o) continue;
    const critical = res.values.some((v) => v.flag === 'C');
    if (critical && !res.criticalCall?.at) {
      criticalCalls += 1;
      if (callsCriticals || validates) {
        items.push({
          id: `critical:${res._id}`,
          kind: 'critical',
          priority: 'urgent',
          title: `Critical value: call the clinic`,
          body: `${name(o.patient)} · ${o.test?.labName}`,
          path: `/results/${o._id}`,
          at: (res.submittedAt ?? o.updatedAt as Date).toISOString(),
        });
      }
    } else if (validates) {
      items.push({
        id: `validation:${res._id}`,
        kind: 'validation',
        priority: o.urgency === 'stat' ? 'urgent' : 'normal',
        title: `Ready to validate: ${o.test?.labName}`,
        body: name(o.patient),
        path: `/results/${o._id}`,
        at: (res.submittedAt ?? o.updatedAt as Date).toISOString(),
      });
    }
  }
  for (const d of flagged) {
    items.push({
      id: `delivery:${d._id}:${(d.updatedAt as Date).getTime()}`,
      kind: 'delivery',
      priority: 'urgent',
      title: `Result not delivered to ${clinics.get(String(d.clinicId)) ?? 'the clinic'}`,
      body: `${name(flaggedOrders.get(String(d.orderId))?.patient)} · ${d.flagReason ?? ''}`.slice(0, 200),
      path: '/deliveries',
      at: (d.updatedAt as Date).toISOString(),
    });
  }
  items.sort((a, b) => (a.priority === b.priority ? b.at.localeCompare(a.at) : a.priority === 'urgent' ? -1 : 1));

  const counts = {
    newOrders: orders.length,
    statOrders: orders.filter((o) => o.urgency === 'stat').length,
    toValidate: validates ? results.length : 0,
    criticalCalls: callsCriticals || validates ? criticalCalls : 0,
    flaggedDeliveries: flagged.length,
  };
  const badge = counts.newOrders + counts.toValidate + (validates ? 0 : counts.criticalCalls) + counts.flaggedDeliveries;
  return { counts, badge, items: items.slice(0, LIMIT) };
}
