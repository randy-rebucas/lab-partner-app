'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useFormAction } from '@/components/ui/useFormAction';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Select, Textarea } from '@/components/ui/Field';
import { StatusLine } from '@/components/ui/StatusLine';
import { REJECT_REASONS } from '@/lib/orders/status';
import { acceptOrderAction, rejectOrderAction, type OrderActionResult } from '@/app/(app)/orders/actions';


/** Accept and Reject for one order. Results go to onResult, so a list can show one status line. */
export function OrderActions({
  orderId,
  label,
  canAccept,
  canReject,
  size = 'sm',
  onResult,
}: {
  orderId: string;
  /** "Reyes, Ana · CBC", for button names and the dialog title. */
  label: string;
  canAccept: boolean;
  canReject: boolean;
  size?: 'sm' | 'md';
  onResult: (r: OrderActionResult) => void;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      {canAccept && (
        <Button
          size={size}
          disabled={busy}
          aria-label={size === 'sm' ? `Accept ${label}` : undefined}
          onClick={() =>
            start(async () => {
              onResult(await acceptOrderAction(orderId));
              router.refresh();
            })
          }
        >
          Accept
        </Button>
      )}
      {canReject && (
        <Button variant="secondary" size={size} aria-label={size === 'sm' ? `Reject ${label}` : undefined} onClick={() => setRejecting(true)}>
          Reject
        </Button>
      )}
      {rejecting && (
        <RejectDialog
          orderId={orderId}
          label={label}
          onClose={() => setRejecting(false)}
          onDone={(r) => {
            setRejecting(false);
            onResult(r);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function RejectDialog({ orderId, label, onClose, onDone }: { orderId: string; label: string; onClose: () => void; onDone: (r: OrderActionResult) => void }) {
  const [state, onSubmit, pending] = useFormAction(rejectOrderAction.bind(null, orderId));
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) onDone(state);
  }
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <Dialog open onClose={onClose} title={`Reject ${label}?`} subtitle="The order closes. The reason is kept with it and shown to the clinic later.">
      <form onSubmit={onSubmit} className="space-y-5">
        {state && !state.ok && state.error && <StatusLine tone="error">{state.error}</StatusLine>}
        <Field id="reason" label="Reason" error={fe.reason}>
          <Select id="reason" defaultValue="" error={fe.reason}>
            <option value="" disabled>
              Choose…
            </option>
            {REJECT_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <Field id="detail" label="Details" hint="Required for Other. For example: date of birth missing." error={fe.detail}>
          <Textarea id="detail" rows={2} maxLength={300} error={fe.detail} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" variant="destructive" disabled={pending}>
            {pending ? 'Rejecting…' : 'Reject order'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
