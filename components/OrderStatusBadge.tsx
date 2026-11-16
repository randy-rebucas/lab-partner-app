import { Badge } from '@/components/ui/Badge';
import { STATUS_DISPLAY, type OrderStatus, type Urgency } from '@/lib/orders/status';

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { label, tone } = STATUS_DISPLAY[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  if (urgency === 'routine') return <Badge tone="outline">Routine</Badge>;
  return <Badge tone={urgency === 'stat' ? 'red' : 'amber'}>{urgency === 'stat' ? 'STAT' : 'Urgent'}</Badge>;
}
