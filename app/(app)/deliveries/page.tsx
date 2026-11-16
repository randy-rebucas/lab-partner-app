import Link from 'next/link';
import { Send } from 'lucide-react';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { requireUser } from '@/lib/auth/guards';
import { hasAnyRole } from '@/lib/auth/roles';
import { EmptyState, Mono, PageHeader, Panel, PanelHeader } from '@/components/ui/Panel';
import { LiveRefresh } from '@/components/orders/LiveRefresh';
import { DeliveryStatus } from '@/components/work/DeliveryStatus';
import { ConnectedClinic } from '@/models/ConnectedClinic';
import { Delivery } from '@/models/Delivery';
import { Order } from '@/models/Order';
import { RetryButton } from './RetryButton';

export const metadata = { title: 'Deliveries' };

export default async function DeliveriesPage() {
  const me = await requireUser(['admin', 'front-desk', 'signatory']);
  await connectDB();
  const labId = new Types.ObjectId(me.labId);
  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - 2);
  const [open, done] = await Promise.all([
    Delivery.find({ labId, deliveredAt: null }).sort({ flagged: -1, createdAt: 1 }).limit(200).lean(),
    Delivery.find({ labId, deliveredAt: { $gte: since } }).sort({ deliveredAt: -1 }).limit(100).lean(),
  ]);
  const all = [...open, ...done];
  const [orders, clinics] = await Promise.all([
    Order.find({ _id: { $in: all.map((d) => d.orderId) } }).select('patient test.labName requestCode').lean(),
    ConnectedClinic.find({ _id: { $in: all.map((d) => d.clinicId) } }).select('name').lean(),
  ]);
  const orderOf = new Map(orders.map((o) => [String(o._id), o]));
  const clinicOf = new Map(clinics.map((c) => [String(c._id), c.name]));
  const canRetry = hasAnyRole(me.roles, ['admin', 'front-desk', 'signatory']);
  const flagged = open.filter((d) => d.flagged).length;

  const list = (rows: typeof all, retry: boolean) => (
    <ul className="divide-y divide-gray-100">
      {rows.map((d) => {
        const o = orderOf.get(String(d.orderId));
        return (
          <li key={String(d._id)} className="grid grid-cols-1 gap-2 px-5 py-3.5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,2fr)_auto] md:items-center md:gap-4">
            <div className="min-w-0">
              <Link href={`/results/${d.orderId}`} className="block truncate rounded text-sm font-semibold text-gray-900 hover:text-brand-teal-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal">
                {o ? `${o.patient?.lastName}, ${o.patient?.firstName}` : 'Removed order'}
              </Link>
              <p className="truncate text-xs text-gray-500">
                {o?.test?.labName} · {clinicOf.get(String(d.clinicId))} · <Mono>{o?.requestCode}</Mono>
              </p>
            </div>
            <DeliveryStatus d={d} clinicName={clinicOf.get(String(d.clinicId)) ?? 'the clinic'} />
            <div className="md:justify-self-end">{retry && canRetry && <RetryButton deliveryId={String(d._id)} label={d.resultIdString} />}</div>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <PageHeader
        title="Deliveries"
        subtitle={
          <>
            Results sent to clinics. <Mono>{flagged}</Mono> need attention, <Mono>{open.length - flagged}</Mono> being sent or retried.
          </>
        }
        actions={<LiveRefresh renderedAt={now.toISOString()} />}
      />
      {all.length === 0 ? (
        <Panel>
          <EmptyState icon={<Send className="h-5 w-5" strokeWidth={1.75} />} title="Nothing sent yet" hint="Released results are sent to the clinic automatically and listed here." />
        </Panel>
      ) : (
        <>
          {open.length > 0 && (
            <Panel className="overflow-hidden">
              <PanelHeader title="Not yet delivered" subtitle="Failed sends retry by themselves for 24 hours. Flagged ones need a person: fix the cause, then send again." />
              {list(open, true)}
            </Panel>
          )}
          {done.length > 0 && (
            <Panel className="overflow-hidden">
              <PanelHeader title="Delivered in the last 2 days" />
              {list(done, false)}
            </Panel>
          )}
        </>
      )}
    </>
  );
}
