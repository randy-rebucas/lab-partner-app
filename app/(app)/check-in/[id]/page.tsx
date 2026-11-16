import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { requireUser } from '@/lib/auth/guards';
import { CAN, hasAnyRole } from '@/lib/auth/roles';
import { CONTAINER_FOR, manilaInputValue } from '@/lib/specimen-options';
import { type OrderStatus, type Urgency } from '@/lib/orders/status';
import { ageText, birthDateText, manilaDateTime } from '@/lib/time';
import { OrderStatusBadge, UrgencyBadge } from '@/components/OrderStatusBadge';
import { ButtonLink } from '@/components/ui/Button';
import { Mono, PageHeader, Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { StatusLine } from '@/components/ui/StatusLine';
import { ConnectedClinic } from '@/models/ConnectedClinic';
import { Order } from '@/models/Order';
import { Specimen } from '@/models/Specimen';
import { TestDefinition } from '@/models/TestDefinition';
import { CheckInForm, CollectForm } from './CheckInForms';

export const metadata = { title: 'Check-in' };

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <Panel>
      <PanelHeader
        title={
          <span className="flex items-center gap-3">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full font-mono text-sm tabular-nums ${done ? 'bg-brand-teal-dark text-white' : 'bg-gray-100 text-gray-600'}`}
              aria-hidden="true"
            >
              {n}
            </span>
            {title}
            {done && <span className="sr-only">(done)</span>}
          </span>
        }
      />
      <PanelBody>{children}</PanelBody>
    </Panel>
  );
}

export default async function CheckInOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser([...CAN.checkIn, ...CAN.collect]);
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();
  await connectDB();
  const o = await Order.findOne({ _id: id, labId: me.labId }).lean();
  if (!o) notFound();
  const [clinic, test, specimens] = await Promise.all([
    ConnectedClinic.findById(o.clinicId).select('name').lean(),
    TestDefinition.findById(o.test?.testId).select('specimenType').lean(),
    Specimen.find({ orderId: id }).sort({ collectedAt: -1 }).lean(),
  ]);
  const status = o.status as OrderStatus;
  const p = o.patient!;
  const current = specimens.find((s) => String(s._id) === String(o.specimenId));
  const rejected = current?.status === 'rejected' ? current : null;
  const checkedIn = !!o.checkIn?.at;
  const collected = status !== 'received' && status !== 'accepted' && status !== 'rejected' && current?.status === 'collected';
  const canCheckIn = hasAnyRole(me.roles, CAN.checkIn);
  const canCollect = hasAnyRole(me.roles, CAN.collect);
  const age = ageText(p.dateOfBirth);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {p.lastName}, {p.firstName}
            <OrderStatusBadge status={status} />
            <UrgencyBadge urgency={o.urgency as Urgency} />
          </span>
        }
        subtitle={
          <>
            {o.test?.labName} for {clinic?.name ?? 'a removed clinic'} · <Mono>{o.requestCode}</Mono>
          </>
        }
        actions={
          <ButtonLink href={`/orders/${id}`} variant="secondary">
            Order details
          </ButtonLink>
        }
      />
      {status === 'rejected' && <StatusLine tone="error">This order was rejected: {o.rejectReason}. Nothing to collect.</StatusLine>}
      {rejected && (
        <StatusLine tone="warning">
          Specimen <Mono>{rejected.accessionNo}</Mono> was rejected ({rejected.rejectedReason}). Collect a new one; it gets a new accession number.
        </StatusLine>
      )}

      {status !== 'rejected' && (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Step n={1} title="Check the patient’s ID" done={checkedIn}>
            {checkedIn ? (
              <p className="text-sm text-gray-600">
                {o.checkIn!.idType} checked by {o.checkIn!.by}, <Mono>{manilaDateTime(o.checkIn!.at!)}</Mono>
                {o.checkIn!.note && <span className="block text-gray-500">Note: {o.checkIn!.note}</span>}
              </p>
            ) : canCheckIn ? (
              <CheckInForm
                orderId={id}
                name={`${p.firstName} ${p.lastName}`}
                birthDate={p.dateOfBirth ? `${birthDateText(p.dateOfBirth)}${age ? ` (${age})` : ''}` : null}
                notYetAccepted={status === 'received'}
              />
            ) : (
              <p className="text-sm text-gray-600">The front desk checks the patient’s ID first.</p>
            )}
          </Step>

          <Step n={2} title={rejected ? 'Collect a new specimen' : 'Collect the specimen'} done={collected}>
            {collected && current ? (
              <div className="space-y-3 text-sm text-gray-600">
                <p>
                  <Mono className="text-base font-semibold text-gray-900">{current.accessionNo}</Mono> · {current.container}
                </p>
                <p>
                  Collected by {current.collectedBy}, <Mono>{manilaDateTime(current.collectedAt)}</Mono> · condition {current.condition.toLowerCase()}
                </p>
                <ButtonLink href={`/labels/${current._id}?print=1`} target="_blank" rel="noopener">
                  Print label
                </ButtonLink>
              </div>
            ) : !checkedIn ? (
              <p className="text-sm text-gray-500">After the ID check.</p>
            ) : canCollect ? (
              <CollectForm
                orderId={id}
                defaultContainer={CONTAINER_FOR[test?.specimenType ?? ''] ?? 'Other container'}
                specimenType={test?.specimenType ?? 'Not set in the catalog'}
                defaultTime={manilaInputValue()}
                instructions={o.instructions ?? null}
              />
            ) : (
              <p className="text-sm text-gray-600">A phlebotomist records the collection.</p>
            )}
          </Step>
        </div>
      )}
    </>
  );
}
