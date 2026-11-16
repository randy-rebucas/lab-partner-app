import 'server-only';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { SECTIONS } from '@/lib/catalog/names';
import { urgencyRank, type OrderStatus, type Urgency } from '@/lib/orders/status';
import { sectionSlug, tatState, type TatState } from '@/lib/tat';
import { ConnectedClinic } from '@/models/ConnectedClinic';
import { Order } from '@/models/Order';
import { Result } from '@/models/Result';
import { Specimen } from '@/models/Specimen';
import { TestDefinition } from '@/models/TestDefinition';

// Bench worklists per section (FR-9) and the validation queue (FR-13).

export type WorkRow = {
  orderId: string;
  accessionNo: string;
  patientName: string;
  sexAge: { sex?: string; dateOfBirth?: string };
  testName: string;
  clinicName: string;
  urgency: Urgency;
  status: OrderStatus;
  collectedAt: string;
  targetHours: number;
  tat: TatState;
  sentBack?: string;
  critical?: boolean;
  enteredBy?: string;
  criticalCalled?: boolean;
};

async function rows(labId: string, statuses: OrderStatus[], testIds: Types.ObjectId[] | null, now: Date): Promise<WorkRow[]> {
  await connectDB();
  const filter: Record<string, unknown> = { labId: new Types.ObjectId(labId), status: { $in: statuses } };
  if (testIds) filter['test.testId'] = { $in: testIds };
  const orders = await Order.find(filter).select('patient test urgency status clinicId specimenId accessionNo receivedAt').limit(500).lean();
  const [specimens, tests, clinics, results] = await Promise.all([
    Specimen.find({ _id: { $in: orders.map((o) => o.specimenId).filter(Boolean) } }).select('collectedAt').lean(),
    TestDefinition.find({ _id: { $in: [...new Set(orders.map((o) => String(o.test?.testId)))] } }).select('turnaroundHours').lean(),
    ConnectedClinic.find({ _id: { $in: [...new Set(orders.map((o) => String(o.clinicId)))] } }).select('name').lean(),
    Result.find({ orderId: { $in: orders.map((o) => o._id) } }).sort({ version: -1 }).select('orderId status sentBackNote values.flag enteredBy criticalCall.at').lean(),
  ]);
  const collected = new Map(specimens.map((s) => [String(s._id), s.collectedAt]));
  const tat = new Map(tests.map((t) => [String(t._id), t.turnaroundHours]));
  const clinic = new Map(clinics.map((c) => [String(c._id), c.name]));
  const latest = new Map<string, (typeof results)[number]>();
  for (const r of results) if (!latest.has(String(r.orderId))) latest.set(String(r.orderId), r);

  return orders
    .map((o) => {
      const at = collected.get(String(o.specimenId)) ?? o.receivedAt;
      const target = tat.get(String(o.test?.testId)) ?? 24;
      const r = latest.get(String(o._id));
      return {
        orderId: String(o._id),
        accessionNo: o.accessionNo ?? '',
        patientName: `${o.patient?.lastName}, ${o.patient?.firstName}`,
        sexAge: { sex: o.patient?.sex ?? undefined, dateOfBirth: o.patient?.dateOfBirth ?? undefined },
        testName: o.test?.labName ?? '',
        clinicName: clinic.get(String(o.clinicId)) ?? 'Removed clinic',
        urgency: o.urgency as Urgency,
        status: o.status as OrderStatus,
        collectedAt: new Date(at).toISOString(),
        targetHours: target,
        tat: tatState(at, target, now),
        sentBack: r?.status === 'draft' ? (r.sentBackNote ?? undefined) : undefined,
        critical: r ? r.values.some((v) => v.flag === 'C') : false,
        enteredBy: r?.enteredBy,
        criticalCalled: !!r?.criticalCall?.at,
      };
    })
    .sort((a, b) => urgencyRank(a.urgency) - urgencyRank(b.urgency) || a.collectedAt.localeCompare(b.collectedAt));
}

export function sectionFromSlug(slug: string): string | null {
  return SECTIONS.find((s) => sectionSlug(s) === slug) ?? null;
}

export async function sectionWorklist(labId: string, section: string, now = new Date()): Promise<WorkRow[]> {
  await connectDB();
  const ids = (await TestDefinition.find({ labId, section }).select('_id').lean()).map((t) => t._id);
  return rows(labId, ['collected', 'in-progress'], ids, now);
}

/** Counts per section: waiting at the bench, and how many of those are overdue. */
export async function worklistSummary(labId: string, now = new Date()) {
  const all = await rows(labId, ['collected', 'in-progress'], null, now);
  await connectDB();
  const sectionOf = new Map((await TestDefinition.find({ labId }).select('section').lean()).map((t) => [String(t._id), t.section]));
  const orders = new Map((await Order.find({ _id: { $in: all.map((r) => r.orderId) } }).select('test.testId').lean()).map((o) => [String(o._id), sectionOf.get(String(o.test?.testId))]));
  return SECTIONS.map((section) => {
    const mine = all.filter((r) => orders.get(r.orderId) === section);
    return { section, slug: sectionSlug(section), waiting: mine.length, overdue: mine.filter((r) => r.tat !== 'on-time').length, stat: mine.filter((r) => r.urgency === 'stat').length };
  });
}

export async function validationQueue(labId: string, now = new Date()): Promise<WorkRow[]> {
  return rows(labId, ['awaiting-validation'], null, now);
}
