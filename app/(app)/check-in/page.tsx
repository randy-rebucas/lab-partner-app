import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ScanLine, UserCheck } from 'lucide-react';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { requireUser } from '@/lib/auth/guards';
import { CAN } from '@/lib/auth/roles';
import { findOrderByCode } from '@/lib/specimens';
import { urgencyRank, type Urgency } from '@/lib/orders/status';
import { ageText, elapsed, manilaWhen } from '@/lib/time';
import { UrgencyBadge } from '@/components/OrderStatusBadge';
import { Badge } from '@/components/ui/Badge';
import { buttonClass } from '@/components/ui/Button';
import { inputClass } from '@/components/ui/Field';
import { EmptyState, Mono, PageHeader, Panel, PanelHeader } from '@/components/ui/Panel';
import { LiveRefresh } from '@/components/orders/LiveRefresh';
import { ConnectedClinic } from '@/models/ConnectedClinic';
import { Order } from '@/models/Order';

export const metadata = { title: 'Check-in' };

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default async function CheckInPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireUser([...CAN.checkIn, ...CAN.collect]);
  const q = ((await searchParams).q ?? '').trim().slice(0, 64);
  // A scanner types a code and Enter: go straight to that order.
  if (q) {
    const hit = await findOrderByCode(me.labId, q);
    if (hit) redirect(`/check-in/${hit}`);
  }
  await connectDB();
  const filter: Record<string, unknown> = { labId: new Types.ObjectId(me.labId), status: { $in: ['received', 'accepted'] } };
  if (q) {
    filter.$and = q
      .split(/\s+/)
      .slice(0, 4)
      .map((w) => ({ $or: [{ 'patient.firstName': new RegExp(escapeRegex(w), 'i') }, { 'patient.lastName': new RegExp(escapeRegex(w), 'i') }] }));
  }
  const orders = await Order.find(filter).select('patient test urgency status requestCode clinicId receivedAt checkIn specimenId').sort({ receivedAt: 1 }).limit(200).lean();
  const clinics = new Map(
    (await ConnectedClinic.find({ _id: { $in: [...new Set(orders.map((o) => String(o.clinicId)))] } }).select('name').lean()).map((c) => [String(c._id), c.name])
  );
  const rows = orders
    .map((o) => ({
      o,
      stage: o.specimenId ? ('recollect' as const) : o.checkIn?.at ? ('collect' as const) : ('check-in' as const),
    }))
    .sort((a, b) => urgencyRank(a.o.urgency as Urgency) - urgencyRank(b.o.urgency as Urgency));
  const now = new Date();
  const sections = [
    { key: 'collect', title: 'Checked in, waiting for collection', rows: rows.filter((r) => r.stage !== 'check-in') },
    { key: 'check-in', title: 'Expected patients', rows: rows.filter((r) => r.stage === 'check-in') },
  ];

  return (
    <>
      <PageHeader title="Check-in" subtitle="Scan the request slip or search the patient. Check their ID, then collect the specimen." actions={<LiveRefresh renderedAt={now.toISOString()} />} />
      <form role="search" action="/check-in" className="flex max-w-xl gap-2">
        <label htmlFor="q" className="sr-only">
          Scan or search
        </label>
        <div className="relative flex-1">
          <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" strokeWidth={1.75} aria-hidden="true" />
          <input id="q" name="q" defaultValue={q} autoFocus placeholder="Scan a code, or type the patient’s name" className={`${inputClass} pl-9`} />
        </div>
        <button type="submit" className={buttonClass('primary', 'md')}>
          Find
        </button>
      </form>
      {q && rows.length === 0 && (
        <p role="status" className="text-sm text-gray-600">
          No waiting order matches “{q}”. Check the code, or look in the order inbox.
        </p>
      )}
      {rows.length === 0 && !q ? (
        <Panel>
          <EmptyState icon={<UserCheck className="h-5 w-5" strokeWidth={1.75} />} title="No one to check in" hint="Accepted orders appear here until their specimen is collected." />
        </Panel>
      ) : (
        sections
          .filter((s) => s.rows.length)
          .map((s) => (
            <Panel key={s.key} className="overflow-hidden">
              <PanelHeader title={s.title} subtitle={<><Mono>{s.rows.length}</Mono> {s.rows.length === 1 ? 'patient' : 'patients'}</>} />
              <ul className="divide-y divide-gray-100">
                {s.rows.map(({ o, stage }) => {
                  const age = ageText(o.patient?.dateOfBirth);
                  return (
                    <li key={String(o._id)}>
                      <Link
                        href={`/check-in/${o._id}`}
                        className="grid grid-cols-1 gap-2 px-5 py-3.5 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal md:grid-cols-[6rem_minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.3fr)_auto] md:items-center md:gap-4"
                      >
                        <div>
                          <UrgencyBadge urgency={o.urgency as Urgency} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {o.patient?.lastName}, {o.patient?.firstName}
                          </p>
                          <p className="text-xs text-gray-500">{[age, o.patient?.sex === 'male' ? 'Male' : o.patient?.sex === 'female' ? 'Female' : null].filter(Boolean).join(' · ') || 'Age and sex not sent'}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm text-gray-900">{o.test?.labName}</p>
                          <p className="truncate text-xs text-gray-500">
                            {clinics.get(String(o.clinicId)) ?? 'Removed clinic'} · <Mono>{o.requestCode}</Mono>
                          </p>
                        </div>
                        <p className="text-sm text-gray-600">
                          {stage === 'check-in' ? (
                            <>
                              Ordered <Mono>{manilaWhen(o.receivedAt, now)}</Mono>
                            </>
                          ) : (
                            <>
                              Checked in <Mono>{o.checkIn?.at ? elapsed(o.checkIn.at, now) : ''}</Mono> ago
                            </>
                          )}
                        </p>
                        <div>
                          {stage === 'recollect' ? (
                            <Badge tone="red">Recollect</Badge>
                          ) : stage === 'collect' ? (
                            <Badge tone="teal">Collect</Badge>
                          ) : o.status === 'received' ? (
                            <Badge tone="outline">Not yet accepted</Badge>
                          ) : (
                            <Badge tone="teal">Check in</Badge>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ))
      )}
    </>
  );
}
