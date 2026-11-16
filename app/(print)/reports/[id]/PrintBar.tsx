'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { printPage } from '@/lib/desktop-bridge';

export function PrintBar({ serial }: { serial: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="no-print flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-6 py-4">
      <h1 className="mr-auto text-base font-bold tracking-tight text-gray-900">
        Report <span className="font-mono tabular-nums">{serial}</span>
      </h1>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <Button onClick={() => void printPage('report').then(setError)}>Print</Button>
    </div>
  );
}
