import { ScanLine, TestTubes } from 'lucide-react';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { requireUser } from '@/lib/auth/guards';
import { CAN, hasAnyRole } from '@/lib/auth/roles';
import type { OrderStatus } from '@/lib/orders/status';
import { buttonClass } from '@/components/ui/Button';
import { inputClass } from '@/components/ui/Field';
import { EmptyState, Mono, PageHeader, Panel } from '@/components/ui/Panel';
import { Order } from '@/models/Order';
import { Specimen } from '@/models/Specimen';
import { SpecimenList, type SpecimenRow } from './SpecimenList';

export const metadata = { title: 'Specimens' };

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DAYS = 3;

export default async function SpecimensPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireUser(CAN.seeSpecimens);
  const q = ((await searchParams).q ?? '').trim().slice(0, 64);
  await connectDB();
  const labId = new Types.ObjectId(me.labId);

  let filter: Record<string, unknown>;
  if (/^\d{6}-\d{4}$/.test(q)) {
    filter = { labId, accessionNo: q };
  } else if (q) {
    const words = q.split(/\s+/).slice(0, 4);
    const orders = await Order.find({
      labId,
      specimenId: { $exists: true },
      $and: words.map((w) => ({ $or: [{ 'patient.firstName': new RegExp(escapeRegex(w), 'i') }, { 'patient.lastName': new RegExp(escapeRegex(w), 'i') }] })),
    })
      .select('_id')
      .limit(200)
      .lean();
    filter = { labId, orderId: { $in: orders.map((o) => o._id) } };
  } else {
    const since = new Date();
    since.setDate(since.getDate() - DAYS);
    filter = { labId, collectedAt: { $gte: since } };
  }
  const specimens = await Specimen.find(filter).sort({ collectedAt: -1 }).limit(300).lean();
  const orders = new Map(
    (await Order.find({ _id: { $in: specimens.map((s) => s.orderId) } }).select('patient test status urgency').lean()).map((o) => [String(o._id), o])
  );
  const rows: SpecimenRow[] = specimens.map((s) => {
    const o = orders.get(String(s.orderId));
    return {
      id: String(s._id),
      orderId: String(s.orderId),
      accessionNo: s.accessionNo,
      patientName: o ? `${o.patient?.lastName}, ${o.patient?.firstName}` : 'Unknown order',
      testName: o?.test?.labName ?? '',
      container: s.container,
      collectedAt: s.collectedAt.toISOString(),
      collectedBy: s.collectedBy,
      condition: s.condition,
      status: s.status as 'collected' | 'rejected',
      rejectedReason: s.rejectedReason ?? undefined,
      orderStatus: (o?.status ?? 'rejected') as OrderStatus,
      recollection: !!s.recollectOf,
    };
  });

  return (
    <>
      <PageHeader
        title="Specimens"
        subtitle={q ? `Matching “${q}”.` : `Collected in the last ${DAYS} days. Scan a label to find its specimen.`}
      />
      <form role="search" action="/specimens" className="flex max-w-xl gap-2">
        <label htmlFor="q" className="sr-only">
          Scan or search
        </label>
        <div className="relative flex-1">
          <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" strokeWidth={1.75} aria-hidden="true" />
          <input id="q" name="q" defaultValue={q} autoFocus placeholder="Scan a label, or type the patient’s name" className={`${inputClass} pl-9`} />
        </div>
        <button type="submit" className={buttonClass('primary', 'md')}>
          Find
        </button>
      </form>
      {rows.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<TestTubes className="h-5 w-5" strokeWidth={1.75} />}
            title={q ? `No specimen matches “${q}”` : 'No specimens yet'}
            hint={q ? 'Check the number on the label.' : 'Specimens appear here once collected at check-in.'}
          />
        </Panel>
      ) : (
        <>
          <SpecimenList rows={rows} canReject={hasAnyRole(me.roles, CAN.rejectSpecimen)} />
          <p className="text-xs text-gray-500">
            <Mono>{rows.length}</Mono> {rows.length === 1 ? 'specimen' : 'specimens'}
          </p>
        </>
      )}
    </>
  );
}
