import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { requireUser } from '@/lib/auth/guards';
import { CAN, hasAnyRole } from '@/lib/auth/roles';
import { canTransition, type OrderStatus, type Urgency } from '@/lib/orders/status';
import { ageText, birthDateText, manilaDateTime } from '@/lib/time';
import { OrderStatusBadge, UrgencyBadge } from '@/components/OrderStatusBadge';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Mono, PageHeader, Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { StatusLine } from '@/components/ui/StatusLine';
import { ConnectedClinic } from '@/models/ConnectedClinic';
import { Order } from '@/models/Order';
import { Specimen } from '@/models/Specimen';
import { OrderPageActions } from './OrderPageActions';

export const metadata = { title: 'Order' };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 py-2 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="min-w-0 break-words text-gray-900">{children}</dd>
    </div>
  );
}

const none = <span className="text-gray-400">Not sent</span>;

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser(['admin', 'front-desk', 'medtech', 'signatory']);
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();
  await connectDB();
  const o = await Order.findOne({ _id: id, labId: me.labId }).lean();
  if (!o) notFound();
  const [clinic, specimens] = await Promise.all([
    ConnectedClinic.findById(o.clinicId).select('name').lean(),
    Specimen.find({ orderId: id }).sort({ collectedAt: -1 }).lean(),
  ]);
  const status = o.status as OrderStatus;
  const p = o.patient!;
  const age = ageText(p.dateOfBirth);
  const canDecide = hasAnyRole(me.roles, CAN.decideOrders);
  const atCounter = (status === 'received' || status === 'accepted') && hasAnyRole(me.roles, [...CAN.checkIn, ...CAN.collect]);
  const extras = (o.extras ?? {}) as Record<string, unknown>;
  const inLab = !['received', 'accepted', 'rejected'].includes(status) && hasAnyRole(me.roles, ['admin', 'medtech', 'signatory', 'front-desk']);

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
          (canDecide || atCounter || inLab) && (
            <div className="flex flex-wrap items-start gap-2">
              {inLab && (
                <ButtonLink href={`/results/${id}`} variant="primary">
                  Results
                </ButtonLink>
              )}
              {atCounter && (
                <ButtonLink href={`/check-in/${id}`} variant={status === 'received' ? 'secondary' : 'primary'}>
                  {o.checkIn?.at ? (o.specimenId ? 'Recollect specimen' : 'Collect specimen') : 'Check in'}
                </ButtonLink>
              )}
              {canDecide && (
            <OrderPageActions
              orderId={id}
              label={`${p.lastName}, ${p.firstName} · ${o.test?.labName}`}
              canAccept={canTransition(status, 'accepted') && status === 'received'}
              canReject={status === 'received' || status === 'accepted'}
            />
              )}
            </div>
          )
        }
      />
      {status === 'rejected' && o.rejectReason && <StatusLine tone="error">Rejected: {o.rejectReason}</StatusLine>}

      <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Panel>
            <PanelHeader title="Patient" subtitle="As the clinic sent it. Check it against the patient’s ID at check-in." />
            <PanelBody>
              <dl className="divide-y divide-gray-100">
                <Row label="Name">
                  {p.firstName} {p.lastName}
                </Row>
                <Row label="Date of birth">
                  {p.dateOfBirth ? (
                    <>
                      <Mono>{birthDateText(p.dateOfBirth)}</Mono>
                      {age && <span className="text-gray-500"> · {age}</span>}
                    </>
                  ) : (
                    none
                  )}
                </Row>
                <Row label="Sex">{p.sex === 'male' ? 'Male' : p.sex === 'female' ? 'Female' : p.genderText ? `${p.genderText} (as sent)` : none}</Row>
                <Row label="Clinic patient code">{p.patientCode ? <Mono>{p.patientCode}</Mono> : none}</Row>
              </dl>
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Order" />
            <PanelBody>
              <dl className="divide-y divide-gray-100">
                <Row label="Test">
                  {o.test?.labName} <Mono className="text-xs text-gray-500">{o.test?.labCode}</Mono>
                  {o.test?.type && (
                    <p className="text-xs text-gray-500">
                      Sent as “{o.test.type}”{o.test.code && <> · code <Mono>{o.test.code}</Mono></>}
                    </p>
                  )}
                </Row>
                <Row label="Diagnosis">{o.clinicalInfo?.diagnosis || none}</Row>
                <Row label="Chief complaint">{o.clinicalInfo?.chiefComplaint || none}</Row>
                <Row label="Instructions">{o.instructions || none}</Row>
                {typeof extras.orderingDoctor === 'object' && extras.orderingDoctor !== null && (
                  <Row label="Ordering doctor">{String((extras.orderingDoctor as { name?: string }).name ?? '')}</Row>
                )}
                {typeof extras.orderCode === 'string' && (
                  <Row label="Clinic order code">
                    <Mono>{extras.orderCode}</Mono>
                  </Row>
                )}
                <Row label="Clinic">{clinic?.name ?? 'Removed clinic'}</Row>
                <Row label="Request code">
                  <Mono>{o.requestCode}</Mono>
                </Row>
                <Row label="Lab order ID">
                  <Mono>{o.requestId}</Mono>
                </Row>
              </dl>
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Check-in and specimen" />
            <PanelBody>
              <dl className="divide-y divide-gray-100">
                <Row label="ID checked">
                  {o.checkIn?.at ? (
                    <>
                      {o.checkIn.idType} by {o.checkIn.by}, <Mono>{manilaDateTime(o.checkIn.at)}</Mono>
                      {o.checkIn.note && <p className="text-xs text-gray-500">Note: {o.checkIn.note}</p>}
                    </>
                  ) : (
                    <span className="text-gray-400">Not yet</span>
                  )}
                </Row>
                {specimens.length === 0 ? (
                  <Row label="Specimen">
                    <span className="text-gray-400">Not collected yet</span>
                  </Row>
                ) : (
                  specimens.map((sp) => (
                    <Row key={String(sp._id)} label={sp.recollectOf ? 'Recollection' : 'Specimen'}>
                      <span className="flex flex-wrap items-center gap-2">
                        <Mono className={sp.status === 'rejected' ? 'text-gray-500 line-through' : 'font-semibold'}>{sp.accessionNo}</Mono>
                        {sp.status === 'rejected' && <Badge tone="red">Rejected</Badge>}
                        {sp.status === 'collected' && (
                          <a href={`/labels/${sp._id}`} target="_blank" rel="noopener" className="text-xs font-semibold text-brand-teal-dark underline-offset-2 hover:underline">
                            Label
                          </a>
                        )}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {sp.container} · {sp.collectedBy}, <Mono>{manilaDateTime(sp.collectedAt)}</Mono> · {sp.condition.toLowerCase()}
                      </span>
                      {sp.rejectedReason && <span className="block text-xs text-red-700">{sp.rejectedReason} ({sp.rejectedBy})</span>}
                    </Row>
                  ))
                )}
              </dl>
            </PanelBody>
          </Panel>
        </div>

        <Panel>
          <PanelHeader title="History" />
          <ol className="space-y-0 px-5 py-4">
            {[...o.statusHistory].reverse().map((h, i) => (
              <li key={i} className="relative border-l border-gray-200 pb-4 pl-5 last:pb-0">
                <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-teal-dark" aria-hidden="true" />
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <OrderStatusBadge status={h.status as OrderStatus} />
                  <span className="text-gray-900">{h.by}</span>
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  <Mono>{manilaDateTime(h.at)}</Mono>
                </p>
                {h.note && <p className="mt-1 text-sm text-gray-600">{h.note}</p>}
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </>
  );
}
