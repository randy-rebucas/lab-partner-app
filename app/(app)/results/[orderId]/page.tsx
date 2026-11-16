import { notFound } from 'next/navigation';
import { audit } from '@/lib/audit';
import { requireUser } from '@/lib/auth/guards';
import { hasAnyRole } from '@/lib/auth/roles';
import { ageInDays, type Sex } from '@/lib/catalog/flags';
import type { OrderStatus, Urgency } from '@/lib/orders/status';
import { releaseBlocker, resultContext } from '@/lib/results';
import { manilaInputValue } from '@/lib/specimen-options';
import { ageText, manilaDateTime } from '@/lib/time';
import { OrderStatusBadge, UrgencyBadge } from '@/components/OrderStatusBadge';
import { ResultValue } from '@/components/ResultValue';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Mono, PageHeader, Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { StatusLine } from '@/components/ui/StatusLine';
import { DeliveryStatus } from '@/components/work/DeliveryStatus';
import { ConnectedClinic } from '@/models/ConnectedClinic';
import { Delivery } from '@/models/Delivery';
import type { ResultDoc } from '@/models/Result';
import { AmendButton, AttachmentBox, CriticalCallForm, EntryForm, ValidationActions, type AnalyteSpec } from './ResultForms';

export const metadata = { title: 'Results' };

const FLAG_FOR = (flag?: string | null, direction?: string | null) =>
  flag === 'C' ? (direction === 'high' ? 'critical-high' : 'critical-low') : flag === 'H' ? 'high' : flag === 'L' ? 'low' : 'normal';

function ValuesTable({ r, struck = false }: { r: ResultDoc; struck?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className={`w-full text-sm ${struck ? 'text-gray-500 line-through' : ''}`}>
        <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-600">
          <tr>
            <th scope="col" className="px-4 py-2">Analyte</th>
            <th scope="col" className="px-4 py-2">Result</th>
            <th scope="col" className="px-4 py-2">Reference</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {r.values.map((v) => (
            <tr key={v.key} className={v.flag === 'C' && !struck ? 'bg-red-50' : ''}>
              <th scope="row" className="px-4 py-2 text-left font-normal text-gray-900">
                {v.name}
              </th>
              <td className="px-4 py-2">
                <ResultValue value={v.value || '—'} unit={v.unit ?? undefined} flag={FLAG_FOR(v.flag, v.direction)} />
              </td>
              <td className="px-4 py-2 text-xs text-gray-600">
                <Mono>{v.range}</Mono>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {r.interpretation && <p className="border-t border-gray-200 px-4 py-2 text-sm text-gray-700">Remarks: {r.interpretation}</p>}
    </div>
  );
}

export default async function ResultsPage({ params }: { params: Promise<{ orderId: string }> }) {
  const me = await requireUser(['admin', 'medtech', 'signatory', 'front-desk']);
  const { orderId } = await params;
  const ctx = await resultContext(me.labId, orderId);
  if (!ctx) notFound();
  const { order, test, current, versions } = ctx;
  const status = order.status as OrderStatus;
  const p = order.patient!;
  const clinic = await ConnectedClinic.findById(order.clinicId).select('name').lean();
  const deliveries = await Delivery.find({ orderId }).sort({ createdAt: -1 }).lean();
  if (current) await audit({ action: 'result.viewed', labId: me.labId, userId: me.id, entity: 'Result', entityId: current._id });

  const canEnter = hasAnyRole(me.roles, ['medtech', 'signatory']);
  const patient = { sex: (p.sex === 'male' || p.sex === 'female' ? p.sex : undefined) as Sex | undefined, ageDays: ageInDays(p.dateOfBirth, ctx.collectedAt) };
  const analytes: AnalyteSpec[] = test.analytes.map((a) => ({
    key: a.key,
    name: a.name,
    unit: a.unit,
    kind: (a.kind ?? 'number') as 'number' | 'text',
    criticalLow: a.criticalLow,
    criticalHigh: a.criticalHigh,
    ranges: a.ranges.map((r) => ({ sex: r.sex, ageMinDays: r.ageMinDays, ageMaxDays: r.ageMaxDays, low: r.low, high: r.high, text: r.text })),
  }));
  const valuesOf = (r: ResultDoc | null) => Object.fromEntries((r?.values ?? []).map((v) => [v.key, v.value]));
  const entering = (status === 'collected' || status === 'in-progress') && canEnter;
  const validating = status === 'awaiting-validation' && current?.status === 'submitted' ? current : null;
  const released = versions.find((v) => v.status === 'released' && !v.supersededBy) ?? null;
  const shown = validating ?? released;
  const older = versions.filter((v) => v !== shown && v.status === 'released');
  const blocker = validating ? releaseBlocker(me, validating) : null;
  const needsCall = !!validating && validating.values.some((v) => v.flag === 'C') && !validating.criticalCall?.at;
  const age = ageText(p.dateOfBirth);
  const currentDelivery = shown ? deliveries.find((d) => String(d.resultId) === String(shown._id)) : null;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {p.lastName}, {p.firstName}
            <OrderStatusBadge status={status} />
            <UrgencyBadge urgency={order.urgency as Urgency} />
          </span>
        }
        subtitle={
          <>
            {test.name} · <Mono>{ctx.accessionNo || 'no specimen'}</Mono> · {[age, p.sex === 'male' ? 'Male' : p.sex === 'female' ? 'Female' : null].filter(Boolean).join(' · ')} ·{' '}
            {clinic?.name}
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {released?.reportSerial && (
              <ButtonLink href={`/reports/${released._id}`} target="_blank" rel="noopener" variant="secondary">
                Report
              </ButtonLink>
            )}
            <ButtonLink href={`/orders/${orderId}`} variant="secondary">
              Order details
            </ButtonLink>
          </div>
        }
      />
      {status === 'received' || status === 'accepted' ? <StatusLine tone="info">Results can be entered once the specimen is collected.</StatusLine> : null}
      {status === 'rejected' && <StatusLine tone="error">This order was rejected: {order.rejectReason}</StatusLine>}
      {entering && current?.status === 'draft' && current.sentBackNote && <StatusLine tone="warning">Sent back by the signatory: {current.sentBackNote}</StatusLine>}
      {current?.amendReason && current.status !== 'released' && <StatusLine tone="info">Correction of version {current.version - 1}: {current.amendReason}</StatusLine>}

      <div className="grid items-start gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          {entering && (
            <Panel>
              <PanelHeader title={current?.amendReason ? `Correction, version ${current.version}` : 'Enter results'} subtitle={`Collected ${manilaDateTime(ctx.collectedAt)}`} />
              <PanelBody>
                <EntryForm orderId={orderId} analytes={analytes} patient={patient} initial={valuesOf(current?.status === 'draft' ? current : null)} interpretation={current?.status === 'draft' ? (current.interpretation ?? '') : ''} />
              </PanelBody>
            </Panel>
          )}
          {(status === 'collected' || status === 'in-progress') && !canEnter && (
            <Panel>
              <PanelBody>
                <p className="text-sm text-gray-600">A medical technologist enters these results.</p>
              </PanelBody>
            </Panel>
          )}

          {shown && (
            <Panel>
              <PanelHeader
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {validating ? 'Waiting for validation' : 'Released result'} <Badge tone="outline">v{shown.version}</Badge>
                    {shown.reportSerial && <Mono className="text-xs font-normal text-gray-500">{shown.reportSerial}</Mono>}
                  </span>
                }
                subtitle={
                  <>
                    Entered by {shown.enteredBy}, <Mono>{manilaDateTime(shown.enteredAt)}</Mono>
                    {shown.releasedBy && (
                      <>
                        {' '}
                        · released by {shown.releasedBy}, <Mono>{manilaDateTime(shown.releasedAt!)}</Mono>
                      </>
                    )}
                  </>
                }
                actions={released && !validating && canEnter && (status === 'released' || status === 'delivered') ? <AmendButton orderId={orderId} analytes={analytes} patient={patient} initial={valuesOf(released)} interpretation={released.interpretation ?? ''} /> : undefined}
              />
              <PanelBody className="space-y-4">
                <ValuesTable r={shown} />
                {shown.criticalCall?.at && (
                  <p className="text-sm text-gray-600">
                    Critical value called by {shown.criticalCall.calledBy} to {shown.criticalCall.takenBy}, <Mono>{manilaDateTime(shown.criticalCall.at)}</Mono>
                    {shown.criticalCall.note && <> · {shown.criticalCall.note}</>}
                  </p>
                )}
                {validating && hasAnyRole(me.roles, ['signatory']) && <ValidationActions orderId={orderId} blocker={blocker} clinicName={clinic?.name ?? 'the clinic'} />}
              </PanelBody>
            </Panel>
          )}

          {needsCall && hasAnyRole(me.roles, ['medtech', 'signatory']) && (
            <Panel className="border-red-200">
              <PanelHeader title="Critical value: call the clinic" subtitle={`Release is blocked until the call to ${clinic?.name ?? 'the clinic'} is recorded.`} />
              <PanelBody>
                <CriticalCallForm orderId={orderId} defaultTime={manilaInputValue()} />
              </PanelBody>
            </Panel>
          )}

          {older.length > 0 && (
            <Panel>
              <PanelHeader title="Earlier versions" subtitle="What the clinic was sent before each correction." />
              <PanelBody className="space-y-5">
                {older.map((v) => {
                  const by = versions.find((x) => String(x._id) === String(v.supersededBy));
                  return (
                    <div key={String(v._id)} className="space-y-2">
                      <p className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                        <Badge tone="outline">v{v.version}</Badge>
                        {by && <span>Replaced by v{by.version}</span>}
                        <Mono className="text-xs">{v.reportSerial}</Mono>
                        <a href={`/reports/${v._id}`} target="_blank" rel="noopener" className="text-xs font-semibold text-brand-teal-dark underline-offset-2 hover:underline">
                          Report
                        </a>
                      </p>
                      <ValuesTable r={v} struck />
                    </div>
                  );
                })}
              </PanelBody>
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          <Panel>
            <PanelHeader title="Delivery to the clinic" />
            <PanelBody>
              {deliveries.length === 0 ? (
                <p className="text-sm text-gray-500">Sent automatically when results are released.</p>
              ) : (
                <ul className="space-y-4">
                  {deliveries.map((d) => (
                    <li key={String(d._id)}>
                      <DeliveryStatus d={d} clinicName={clinic?.name ?? 'the clinic'} current={currentDelivery ? String(currentDelivery._id) === String(d._id) : false} />
                    </li>
                  ))}
                </ul>
              )}
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Attachments" />
            <PanelBody>
              <AttachmentBox
                orderId={orderId}
                files={(current?.attachments ?? []).map((a) => ({ fileId: a.fileId, name: a.name, size: a.size, addedBy: a.addedBy }))}
                canAdd={entering && current?.status === 'draft'}
              />
              {entering && current?.status !== 'draft' && <p className="mt-2 text-xs text-gray-500">Save a draft first to attach files.</p>}
            </PanelBody>
          </Panel>
        </div>
      </div>
    </>
  );
}
