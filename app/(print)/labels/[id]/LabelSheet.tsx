'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import JsBarcode from 'jsbarcode';
import { Button } from '@/components/ui/Button';

type Label = { accessionNo: string; name: string; detail: string; test: string; collected: string; rejected: boolean };

// Labels print black on white only, for scanner contrast (BUILD_PROMPT "Barcode labels").
const PRINT_CSS = `
@page { size: 50mm 25mm; margin: 0; }
@media print {
  html, body { background: #fff !important; }
  .no-print { display: none !important; }
  .label { break-after: page; border: 0 !important; margin: 0 !important; }
  .sheet { padding: 0 !important; gap: 0 !important; }
}
`;

function Barcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current) JsBarcode(ref.current, value, { format: 'CODE128', displayValue: false, margin: 0, height: 34, width: 1.4, background: '#ffffff', lineColor: '#000000' });
  }, [value]);
  return <svg ref={ref} role="img" aria-label={`Barcode ${value}`} className="h-[8.5mm] w-full" preserveAspectRatio="none" />;
}

export function LabelSheet({ label, copies, autoPrint }: { label: Label; copies: number; autoPrint: boolean }) {
  const router = useRouter();
  const [n, setN] = useState(copies);
  const printed = useRef(false);
  useEffect(() => {
    if (autoPrint && !printed.current && !label.rejected) {
      printed.current = true;
      // Let the barcode SVGs draw first.
      requestAnimationFrame(() => window.print());
    }
  }, [autoPrint, label.rejected]);

  return (
    <main className="min-h-screen bg-gray-50 text-black">
      <style>{PRINT_CSS}</style>
      <div className="no-print flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="mr-auto text-base font-bold tracking-tight text-gray-900">
          Label <span className="font-mono tabular-nums">{label.accessionNo}</span>
        </h1>
        <label htmlFor="copies" className="text-sm text-gray-600">
          Copies
        </label>
        <input
          id="copies"
          type="number"
          min={1}
          max={6}
          value={n}
          onChange={(e) => {
            const v = Math.min(6, Math.max(1, Number(e.target.value) || 1));
            setN(v);
            router.replace(`?copies=${v}`, { scroll: false });
          }}
          className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-teal"
        />
        <Button onClick={() => window.print()} disabled={label.rejected}>
          Print
        </Button>
      </div>
      {label.rejected ? (
        <p role="alert" className="no-print m-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          This specimen was rejected. Print the label of its recollection instead.
        </p>
      ) : (
        <div className="sheet flex flex-wrap gap-4 p-6">
          {Array.from({ length: n }, (_, i) => (
            <section
              key={i}
              aria-label={`Label ${i + 1} of ${n}`}
              className="label flex h-[25mm] w-[50mm] flex-col justify-between overflow-hidden border border-gray-300 bg-white px-[2mm] py-[1.5mm] text-black"
            >
              <p className="truncate text-[8pt] font-bold leading-tight">{label.name}</p>
              <p className="truncate font-mono text-[6.5pt] leading-tight tabular-nums">{label.detail}</p>
              <Barcode value={label.accessionNo} />
              <p className="flex items-baseline justify-between gap-1 font-mono text-[6.5pt] leading-tight tabular-nums">
                <span className="text-[8pt] font-bold">{label.accessionNo}</span>
                <span>{label.collected}</span>
              </p>
              <p className="truncate text-[6pt] leading-tight">{label.test}</p>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
