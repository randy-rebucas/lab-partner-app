'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormAction } from '@/components/ui/useFormAction';
import { Badge } from '@/components/ui/Badge';
import { Button, buttonClass } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Select, Textarea } from '@/components/ui/Field';
import { Mono, Panel } from '@/components/ui/Panel';
import { StatusLine } from '@/components/ui/StatusLine';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { SPECIMEN_REJECT_REASONS } from '@/lib/specimen-options';
import type { OrderStatus } from '@/lib/orders/status';
import { manilaWhen } from '@/lib/time';
import { rejectSpecimenAction, type SpecimenActionResult } from './actions';

export type SpecimenRow = {
  id: string;
  orderId: string;
  accessionNo: string;
  patientName: string;
  testName: string;
  container: string;
  collectedAt: string;
  collectedBy: string;
  condition: string;
  status: 'collected' | 'rejected';
  rejectedReason?: string;
  orderStatus: OrderStatus;
  recollection: boolean;
};

export function SpecimenList({ rows, canReject }: { rows: SpecimenRow[]; canReject: boolean }) {
  const router = useRouter();
  const [result, setResult] = useState<SpecimenActionResult | null>(null);
  const [rejecting, setRejecting] = useState<SpecimenRow | null>(null);
  return (
    <div className="space-y-4">
      {result && (
        <StatusLine tone={result.ok ? 'success' : 'error'} onDismiss={() => setResult(null)}>
          {result.ok ? result.message : result.error}
        </StatusLine>
      )}
      <Panel className="overflow-hidden">
        <ul className="divide-y divide-gray-100">
          {rows.map((r) => {
            const rejectable = r.status === 'collected' && (r.orderStatus === 'collected' || r.orderStatus === 'in-progress');
            return (
              <li
                key={r.id}
                className={`grid grid-cols-1 gap-2 px-5 py-3.5 md:grid-cols-[8.5rem_minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,1.4fr)_auto] md:items-center md:gap-4 ${r.status === 'rejected' ? 'bg-gray-50' : ''}`}
              >
                <div>
                  <Mono className={`text-sm font-semibold ${r.status === 'rejected' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{r.accessionNo}</Mono>
                  {r.recollection && <p className="text-xs text-gray-500">Recollection</p>}
                </div>
                <div className="min-w-0">
                  <Link
                    href={`/orders/${r.orderId}`}
                    className="block truncate rounded text-sm font-semibold text-gray-900 hover:text-brand-teal-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
                  >
                    {r.patientName}
                  </Link>
                  <p className="truncate text-xs text-gray-500">
                    {r.testName} · {r.container}
                  </p>
                </div>
                <div className="text-sm text-gray-600">
                  <p>
                    <Mono>{manilaWhen(r.collectedAt)}</Mono>
                  </p>
                  <p className="truncate text-xs text-gray-500">by {r.collectedBy}</p>
                </div>
                <div className="space-y-1">
                  {r.status === 'rejected' ? (
                    <>
                      <Badge tone="red">Rejected</Badge>
                      <p className="text-xs text-red-700">{r.rejectedReason}</p>
                    </>
                  ) : (
                    <>
                      <OrderStatusBadge status={r.orderStatus} />
                      {r.condition !== 'Good' && <p className="text-xs text-amber-800">{r.condition}</p>}
                    </>
                  )}
                </div>
                <div className="flex gap-2 md:justify-end">
                  {r.status === 'collected' && (
                    <a href={`/labels/${r.id}`} target="_blank" rel="noopener" className={buttonClass('secondary', 'sm')} aria-label={`Label ${r.accessionNo}`}>
                      Label
                    </a>
                  )}
                  {canReject && rejectable && (
                    <Button variant="secondary" size="sm" aria-label={`Reject specimen ${r.accessionNo}`} onClick={() => setRejecting(r)}>
                      Reject
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
      {rejecting && (
        <RejectSpecimenDialog
          row={rejecting}
          onClose={() => setRejecting(null)}
          onDone={(r) => {
            setRejecting(null);
            setResult(r);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function RejectSpecimenDialog({ row, onClose, onDone }: { row: SpecimenRow; onClose: () => void; onDone: (r: SpecimenActionResult) => void }) {
  const [state, onSubmit, pending] = useFormAction(rejectSpecimenAction.bind(null, row.id));
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) onDone(state);
  }
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Reject specimen ${row.accessionNo}?`}
      subtitle={`${row.patientName} · ${row.testName}. The order goes back to check-in, and a new specimen is collected with a new number.`}
    >
      <form onSubmit={onSubmit} className="space-y-5">
        {state && !state.ok && state.error && <StatusLine tone="error">{state.error}</StatusLine>}
        <Field id="reason" label="Reason" error={fe.reason}>
          <Select id="reason" defaultValue="" error={fe.reason}>
            <option value="" disabled>
              Choose…
            </option>
            {SPECIMEN_REJECT_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <Field id="detail" label="Details" hint="Required for Other." error={fe.detail}>
          <Textarea id="detail" rows={2} maxLength={200} error={fe.detail} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" variant="destructive" disabled={pending}>
            {pending ? 'Rejecting…' : 'Reject specimen'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
