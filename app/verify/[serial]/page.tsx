import { headers } from 'next/headers';
import { ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { Photo } from '@/components/Photo';
import { connectDB } from '@/lib/db';
import { manilaDateTime } from '@/lib/time';
import { Lab } from '@/models/Lab';
import { Order } from '@/models/Order';
import { RateWindow } from '@/models/RateWindow';
import { Result } from '@/models/Result';

export const metadata = { title: 'Check a report', robots: { index: false } };

const PER_MINUTE = 20;

/** 20 checks a minute per address, so serials can't be guessed by brute force. */
async function limited(): Promise<boolean> {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
  const minute = Math.floor(Date.now() / 60_000);
  const w = await RateWindow.findOneAndUpdate(
    { key: `verify:${ip}:${minute}` },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((minute + 2) * 60_000) } },
    { upsert: true, new: true, lean: true }
  );
  return (w?.count ?? 0) > PER_MINUTE;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-start justify-center bg-gray-50 px-4 py-16">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="relative h-28 bg-gray-100">
          <Photo name="verify" sizes="448px" eager />
        </div>
        <div className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <BrandLogo size={32} />
            <div className="leading-tight">
              <p className="text-base font-bold tracking-tight text-gray-900">Report check</p>
              <p className="text-xs text-gray-500">Confirms a lab report is genuine</p>
            </div>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}

/** Public: shows lab, date, test names and status only — never patient details or values (FR-17). */
export default async function VerifyPage({ params }: { params: Promise<{ serial: string }> }) {
  const serial = decodeURIComponent((await params).serial).toUpperCase().trim();
  await connectDB();
  if (await limited()) {
    return (
      <Shell>
        <p className="text-sm text-gray-700">Too many checks from this connection. Wait a minute and try again.</p>
      </Shell>
    );
  }
  const r = /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(serial) ? await Result.findOne({ reportSerial: serial, status: 'released' }).select('labId orderId releasedAt supersededBy version').lean() : null;
  if (!r) {
    return (
      <Shell>
        <p className="flex items-center gap-2 text-sm font-semibold text-red-700">
          <ShieldX className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          No report has this number.
        </p>
        <p className="mt-1 text-sm text-gray-600">
          Check the number printed at the bottom of the report: <span className="font-mono tabular-nums">{serial || '—'}</span>
        </p>
      </Shell>
    );
  }
  const [lab, order, newer] = await Promise.all([
    Lab.findById(r.labId).select('name').lean(),
    Order.findById(r.orderId).select('test.labName').lean(),
    r.supersededBy ? Result.findById(r.supersededBy).select('status version').lean() : null,
  ]);
  const replaced = newer?.status === 'released';
  return (
    <Shell>
      <p
        className={`flex items-start gap-2 rounded-md px-3 py-2.5 text-sm font-semibold ring-1 ring-inset ${
          replaced ? 'bg-red-50 text-red-700 ring-red-600/20' : 'bg-emerald-50 text-emerald-800 ring-emerald-600/20'
        }`}
      >
        {replaced ? <ShieldAlert className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" /> : <ShieldCheck className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />}
        {replaced ? `This report was replaced by a corrected version (version ${newer!.version}).` : 'This is a genuine report.'}
      </p>
      <dl className="mt-4 divide-y divide-gray-100 text-sm">
        <div className="grid grid-cols-[7rem_1fr] gap-3 py-2">
          <dt className="text-gray-500">Lab</dt>
          <dd className="text-gray-900">{lab?.name}</dd>
        </div>
        <div className="grid grid-cols-[7rem_1fr] gap-3 py-2">
          <dt className="text-gray-500">Released</dt>
          <dd className="font-mono tabular-nums text-gray-900">{manilaDateTime(r.releasedAt!)}</dd>
        </div>
        <div className="grid grid-cols-[7rem_1fr] gap-3 py-2">
          <dt className="text-gray-500">Test</dt>
          <dd className="text-gray-900">{order?.test?.labName}</dd>
        </div>
        <div className="grid grid-cols-[7rem_1fr] gap-3 py-2">
          <dt className="text-gray-500">Report</dt>
          <dd className="font-mono tabular-nums text-gray-900">
            {serial} · v{r.version}
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-xs text-gray-500">Results are not shown here. Ask the requesting clinic for the report itself.</p>
    </Shell>
  );
}
