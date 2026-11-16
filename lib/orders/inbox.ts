import 'server-only';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { ConnectedClinic } from '@/models/ConnectedClinic';
import { Order } from '@/models/Order';
import { urgencyRank, type OrderStatus, type Urgency } from './status';

// The order inbox (FR-1): orders in views by stage, grouped by clinic, STAT and urgent first.

export const INBOX_VIEWS = {
  new: { label: 'New', statuses: ['received'] },
  accepted: { label: 'Waiting for specimen', statuses: ['accepted'] },
  'in-lab': { label: 'In the lab', statuses: ['collected', 'in-progress', 'awaiting-validation'] },
  done: { label: 'Released', statuses: ['released', 'delivered'], days: 7 },
  rejected: { label: 'Rejected', statuses: ['rejected'], days: 30 },
} as const satisfies Record<string, { label: string; statuses: readonly OrderStatus[]; days?: number }>;

export type InboxView = keyof typeof INBOX_VIEWS;
export const isInboxView = (v: unknown): v is InboxView => typeof v === 'string' && v in INBOX_VIEWS;

export const INBOX_LIMIT = 200;

export type InboxRow = {
  id: string;
  requestCode: string;
  urgency: Urgency;
  status: OrderStatus;
  patientName: string;
  dateOfBirth?: string;
  sex?: string;
  testName: string;
  clinicTestName?: string;
  receivedAt: string;
  updatedAt: string;
  rejectReason?: string;
};

export type InboxGroup = { clinicId: string; clinicName: string; rows: InboxRow[] };

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function viewFilter(labId: string, view: InboxView, now: Date) {
  const v = INBOX_VIEWS[view];
  const filter: Record<string, unknown> = { labId: new Types.ObjectId(labId), status: { $in: v.statuses } };
  if ('days' in v) filter.updatedAt = { $gte: new Date(now.getTime() - v.days * 86_400_000) };
  return filter;
}

export async function inboxCounts(labId: string, now = new Date()): Promise<Record<InboxView, number>> {
  await connectDB();
  const entries = await Promise.all(
    (Object.keys(INBOX_VIEWS) as InboxView[]).map(async (view) => [view, await Order.countDocuments(viewFilter(labId, view, now))] as const)
  );
  return Object.fromEntries(entries) as Record<InboxView, number>;
}

export async function inbox(labId: string, view: InboxView, q = '', now = new Date()): Promise<{ groups: InboxGroup[]; total: number; truncated: boolean }> {
  await connectDB();
  const filter = viewFilter(labId, view, now);
  const words = q.trim().split(/\s+/).filter(Boolean).slice(0, 4);
  if (words.length) {
    filter.$and = words.map((w) => {
      const re = new RegExp(escapeRegex(w), 'i');
      return { $or: [{ 'patient.firstName': re }, { 'patient.lastName': re }, { requestCode: re }, { 'patient.patientCode': re }] };
    });
  }
  const newestFirst = view === 'done' || view === 'rejected';
  const orders = await Order.find(filter)
    .select('requestCode urgency status patient test clinicId receivedAt updatedAt rejectReason')
    .sort({ receivedAt: newestFirst ? -1 : 1 })
    .limit(INBOX_LIMIT + 1)
    .lean();
  const truncated = orders.length > INBOX_LIMIT;
  const shown = orders.slice(0, INBOX_LIMIT);

  const clinics = await ConnectedClinic.find({ _id: { $in: [...new Set(shown.map((o) => String(o.clinicId)))] } })
    .select('name')
    .lean();
  const clinicName = new Map(clinics.map((c) => [String(c._id), c.name]));

  const groups = new Map<string, InboxGroup>();
  for (const o of shown) {
    const id = String(o.clinicId);
    if (!groups.has(id)) groups.set(id, { clinicId: id, clinicName: clinicName.get(id) ?? 'Removed clinic', rows: [] });
    groups.get(id)!.rows.push({
      id: String(o._id),
      requestCode: o.requestCode,
      urgency: o.urgency as Urgency,
      status: o.status as OrderStatus,
      patientName: `${o.patient?.lastName}, ${o.patient?.firstName}`,
      dateOfBirth: o.patient?.dateOfBirth ?? undefined,
      sex: o.patient?.sex ?? undefined,
      testName: o.test?.labName ?? '',
      clinicTestName: o.test?.type && o.test.type.toLowerCase() !== o.test.labName?.toLowerCase() ? o.test.type : undefined,
      receivedAt: o.receivedAt.toISOString(),
      updatedAt: (o.updatedAt as Date).toISOString(),
      rejectReason: o.rejectReason ?? undefined,
    });
  }
  // Within each clinic: STAT, then urgent, then routine; the order of arrival is kept inside each.
  const sorted = [...groups.values()].map((g) => ({ ...g, rows: g.rows.sort((a, b) => urgencyRank(a.urgency) - urgencyRank(b.urgency)) }));
  // Clinics with the most pressing work first, then by name.
  sorted.sort((a, b) => urgencyRank(a.rows[0].urgency) - urgencyRank(b.rows[0].urgency) || a.clinicName.localeCompare(b.clinicName));
  return { groups: sorted, total: shown.length, truncated };
}
