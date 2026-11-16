'use client';

import { useState } from 'react';
import { StatusLine } from '@/components/ui/StatusLine';
import { OrderActions } from '@/components/orders/OrderActions';
import type { OrderActionResult } from '../actions';

export function OrderPageActions(props: { orderId: string; label: string; canAccept: boolean; canReject: boolean }) {
  const [result, setResult] = useState<OrderActionResult | null>(null);
  return (
    <div className="flex flex-col items-end gap-3">
      {(props.canAccept || props.canReject) && <OrderActions {...props} size="md" onResult={setResult} />}
      {result && <StatusLine tone={result.ok ? 'success' : 'error'}>{result.ok ? result.message : result.error}</StatusLine>}
    </div>
  );
}
