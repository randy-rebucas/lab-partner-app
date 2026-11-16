'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { StatusLine } from '@/components/ui/StatusLine';
import { addSampleTestsAction, testStepAction, type CatalogActionResult } from './actions';

export function AddSampleTestsButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<CatalogActionResult | null>(null);
  return (
    <div className="space-y-3">
      {result && !result.ok && <StatusLine tone="error">{result.error}</StatusLine>}
      <Button variant="secondary" disabled={pending} onClick={() => start(async () => setResult(await addSampleTestsAction()))}>
        {pending ? 'Adding…' : 'Add five sample tests'}
      </Button>
    </div>
  );
}

/** Switch a test off (new orders refused) or back on, after a confirmation. */
export function TestActiveToggle({ testId, active, name }: { testId: string; active: boolean; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<CatalogActionResult | null>(null);
  const step = active ? 'switch-off' : 'switch-on';
  return (
    <div className="space-y-3">
      {result && <StatusLine tone={result.ok ? 'success' : 'error'}>{result.ok ? result.message : result.error}</StatusLine>}
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {active ? 'Switch off' : 'Switch on'}
      </Button>
      <AlertDialog
        open={open}
        onClose={() => setOpen(false)}
        title={active ? `Switch off ${name}?` : `Switch on ${name}?`}
        description={
          <p>
            {active
              ? 'Clinics’ new orders for this test are refused as an unknown test. Orders already here carry on to release.'
              : 'Clinics with a name for this test can order it again.'}
          </p>
        }
      >
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Back
        </Button>
        <Button
          variant={active ? 'destructive' : 'primary'}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await testStepAction(testId, step);
              setResult(r);
              setOpen(false);
              router.refresh();
            })
          }
        >
          {active ? 'Switch off' : 'Switch on'}
        </Button>
      </AlertDialog>
    </div>
  );
}
