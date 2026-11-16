import { Badge } from '@/components/ui/Badge';
import { Mono } from '@/components/ui/Panel';
import { manilaWhen } from '@/lib/time';
import type { DeliveryDoc } from '@/models/Delivery';

export type DeliveryState = 'delivered' | 'flagged' | 'sending' | 'retrying';

export function deliveryState(d: Pick<DeliveryDoc, 'deliveredAt' | 'flagged' | 'attempts'>): DeliveryState {
  if (d.deliveredAt) return 'delivered';
  if (d.flagged) return 'flagged';
  return d.attempts > 0 ? 'retrying' : 'sending';
}

/** "Sent to Reyes Family Clinic at 9:41 AM", or why not, in words (FR-15). */
export function DeliveryStatus({
  d,
  clinicName,
  current = true,
}: {
  d: Pick<DeliveryDoc, 'deliveredAt' | 'flagged' | 'flagReason' | 'attempts' | 'lastError' | 'nextAttemptAt' | 'resultIdString' | 'lastStatus'>;
  clinicName: string;
  current?: boolean;
}) {
  const state = deliveryState(d);
  return (
    <div className="space-y-1 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        {state === 'delivered' && <Badge tone="emerald">Delivered</Badge>}
        {state === 'flagged' && <Badge tone="red">Not delivered</Badge>}
        {state === 'retrying' && <Badge tone="amber">Retrying</Badge>}
        {state === 'sending' && <Badge tone="teal">Sending</Badge>}
        <Mono className={`text-xs ${current ? 'text-gray-600' : 'text-gray-400 line-through'}`}>{d.resultIdString}</Mono>
      </p>
      {state === 'delivered' && (
        <p className="text-gray-600">
          Sent to {clinicName} <Mono>{manilaWhen(d.deliveredAt!)}</Mono>
        </p>
      )}
      {state === 'flagged' && <p className="text-red-700">{d.flagReason}</p>}
      {state === 'retrying' && (
        <p className="text-gray-600">
          {d.lastError} Try <Mono>{d.attempts + 1}</Mono> at <Mono>{d.nextAttemptAt ? manilaWhen(d.nextAttemptAt) : 'soon'}</Mono>.
        </p>
      )}
      {state === 'sending' && <p className="text-gray-600">Being sent now.</p>}
    </div>
  );
}
