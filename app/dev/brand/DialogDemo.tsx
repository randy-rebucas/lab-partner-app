'use client';

import { useState } from 'react';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';

export function DialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open dialog
      </Button>
      <AlertDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Release results for Ana Reyes?"
        description={<p>The results go to Reyes Family Clinic straight away. The doctor reviews them before the patient is told.</p>}
      >
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Back
        </Button>
        <Button onClick={() => setOpen(false)}>Release results</Button>
      </AlertDialog>
    </>
  );
}
