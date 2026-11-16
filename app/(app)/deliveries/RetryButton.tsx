'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { retryDeliveryAction } from './actions';

export function RetryButton({ deliveryId, label }: { deliveryId: string; label: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        aria-label={`Send ${label} again`}
        onClick={() =>
          start(async () => {
            const r = await retryDeliveryAction(deliveryId);
            setError(r.ok ? null : (r.error ?? 'Could not send again.'));
            router.refresh();
          })
        }
      >
        {busy ? 'Sending…' : 'Send again'}
      </Button>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
