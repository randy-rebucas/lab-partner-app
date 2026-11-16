'use client';

import { Button } from '@/components/ui/Button';

export function PrintBar({ serial }: { serial: string }) {
  return (
    <div className="no-print flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-4">
      <h1 className="mr-auto text-base font-bold tracking-tight text-gray-900">
        Report <span className="font-mono tabular-nums">{serial}</span>
      </h1>
      <Button onClick={() => window.print()}>Print</Button>
    </div>
  );
}
