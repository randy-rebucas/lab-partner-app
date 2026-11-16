import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import BrandLogo from '@/components/BrandLogo';
import { audit } from '@/lib/audit';
import { requireUser } from '@/lib/auth/guards';
import { connectDB } from '@/lib/db';
import { ageText, birthDateText, manilaDateTime } from '@/lib/time';
import { ConnectedClinic } from '@/models/ConnectedClinic';
import { Lab } from '@/models/Lab';
import { Order } from '@/models/Order';
import { Result } from '@/models/Result';
import { Specimen } from '@/models/Specimen';
import { PrintBar } from './PrintBar';

export const metadata = { title: 'Result report' };

const PRINT_CSS = `
@page { size: A4; margin: 14mm; }
@media print { .no-print { display: none !important; } html, body { background: #fff !important; } .sheet { box-shadow: none !important; border: 0 !important; margin: 0 !important; padding: 0 !important; width: auto !important; } }
`;

const FLAG_TEXT: Record<string, string> = { H: 'H', L: 'L', C: 'C' };

/** A4 result report (FR-17): black text, hairline rules, Mono values; teal only in the logo. */
export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser(['admin', 'medtech', 'signatory', 'front-desk']);
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();
  await connectDB();
  const r = await Result.findOne({ _id: id, labId: me.labId, status: 'released' }).lean();
  if (!r) notFound();
  const [order, lab, newer] = await Promise.all([
    Order.findById(r.orderId).lean(),
    Lab.findById(me.labId).lean(),
    r.supersededBy ? Result.findById(r.supersededBy).select('version status').lean() : null,
  ]);
  if (!order) notFound();
  const [clinic, specimen] = await Promise.all([
    ConnectedClinic.findById(order.clinicId).select('name').lean(),
    order.specimenId ? Specimen.findById(order.specimenId).select('collectedAt accessionNo container').lean() : null,
  ]);
  await audit({ action: 'report.viewed', labId: me.labId, userId: me.id, entity: 'Result', entityId: id, after: { serial: r.reportSerial } });
  const p = order.patient!;
  const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const replaced = newer?.status === 'released';

  return (
    <main className="min-h-screen bg-gray-100 pb-12 text-black">
      <style>{PRINT_CSS}</style>
      <PrintBar serial={r.reportSerial ?? ''} />
      <article className="sheet mx-auto mt-6 w-[210mm] border border-gray-300 bg-white px-[14mm] py-[12mm] text-[10pt] leading-snug">
        {r.supersededBy && (
          <p className="mb-4 border border-black px-3 py-2 text-center font-bold uppercase tracking-wide">
            {replaced ? `Replaced by version ${newer!.version}. Do not use.` : `Being corrected (version ${newer?.version ?? r.version + 1} pending).`}
          </p>
        )}
        <header className="flex items-start justify-between gap-6 border-b border-gray-300 pb-4">
          <div className="flex items-start gap-3">
            <BrandLogo size={40} />
            <div>
              <h1 className="text-[14pt] font-bold">{lab?.name}</h1>
              {lab?.address && <p className="whitespace-pre-line">{lab.address}</p>}
              <p>{[lab?.phone, lab?.email].filter(Boolean).join(' · ')}</p>
              {lab?.licenceNo && <p>DOH licence <span className="font-mono tabular-nums">{lab.licenceNo}</span></p>}
              {lab?.reportHeader && <p className="whitespace-pre-line">{lab.reportHeader}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[12pt] font-bold">Laboratory result</p>
            <p>
              Report <span className="font-mono tabular-nums">{r.reportSerial}</span>
            </p>
            <p>
              Version <span className="font-mono tabular-nums">{r.version}</span>
            </p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-x-8 gap-y-1 border-b border-gray-300 py-3">
          <p>
            <span className="text-gray-600">Patient </span>
            <strong>
              {p.lastName}, {p.firstName}
            </strong>
          </p>
          <p>
            <span className="text-gray-600">Requested by </span>
            {clinic?.name}
          </p>
          <p>
            <span className="text-gray-600">Birth date </span>
            <span className="font-mono tabular-nums">{birthDateText(p.dateOfBirth) ?? 'Not given'}</span>
            {p.dateOfBirth && ` (${ageText(p.dateOfBirth, specimen?.collectedAt ?? r.releasedAt!)})`}
          </p>
          <p>
            <span className="text-gray-600">Request code </span>
            <span className="font-mono tabular-nums">{order.requestCode}</span>
          </p>
          <p>
            <span className="text-gray-600">Sex </span>
            {p.sex === 'male' ? 'Male' : p.sex === 'female' ? 'Female' : 'Not given'}
          </p>
          <p>
            <span className="text-gray-600">Accession </span>
            <span className="font-mono tabular-nums">{specimen?.accessionNo ?? order.accessionNo}</span>
          </p>
          <p>
            <span className="text-gray-600">Collected </span>
            <span className="font-mono tabular-nums">{specimen ? manilaDateTime(specimen.collectedAt) : '—'}</span>
          </p>
          <p>
            <span className="text-gray-600">Released </span>
            <span className="font-mono tabular-nums">{manilaDateTime(r.releasedAt!)}</span>
          </p>
        </section>

        <section className="py-3">
          <h2 className="mb-2 text-[11pt] font-bold">
            {order.test?.labName} <span className="font-mono text-[9pt] font-normal tabular-nums">{order.test?.labCode}</span>
          </h2>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-300 text-left text-[9pt] text-gray-600">
                <th className="py-1 pr-2 font-semibold">Test</th>
                <th className="py-1 pr-2 font-semibold">Result</th>
                <th className="w-8 py-1 pr-2 font-semibold">Flag</th>
                <th className="py-1 pr-2 font-semibold">Unit</th>
                <th className="py-1 font-semibold">Reference</th>
              </tr>
            </thead>
            <tbody>
              {r.values.map((v) => (
                <tr key={v.key} className="border-b border-gray-200">
                  <td className="py-1 pr-2">{v.name}</td>
                  <td className={`py-1 pr-2 font-mono tabular-nums ${v.flag ? 'font-bold' : ''}`}>{v.value || '—'}</td>
                  <td className="py-1 pr-2 font-mono font-bold">{v.flag ? FLAG_TEXT[v.flag] : ''}</td>
                  <td className="py-1 pr-2">{v.unit}</td>
                  <td className="py-1 font-mono tabular-nums">{v.range}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[8pt] text-gray-600">H high · L low · C critical (outside the critical limit)</p>
          {r.criticalCall?.at && (
            <p className="mt-2">
              Critical value called to {r.criticalCall.takenBy} at <span className="font-mono tabular-nums">{manilaDateTime(r.criticalCall.at)}</span> by {r.criticalCall.calledBy}.
            </p>
          )}
          {r.amendReason && <p className="mt-2">Corrected result. Reason: {r.amendReason}</p>}
          {r.interpretation && <p className="mt-2">Remarks: {r.interpretation}</p>}
        </section>

        <footer className="mt-6 grid grid-cols-2 gap-8 border-t border-gray-300 pt-4">
          <div>
            <p className="text-gray-600">Performed by</p>
            <p className="font-semibold">{r.enteredBy}</p>
            {r.enteredByLicence && (
              <p>
                Licence <span className="font-mono tabular-nums">{r.enteredByLicence}</span>
              </p>
            )}
          </div>
          <div>
            <p className="text-gray-600">Validated and released by</p>
            <p className="font-semibold">{r.releasedBy}</p>
            <p>
              Licence <span className="font-mono tabular-nums">{r.releasedByLicence}</span>
            </p>
          </div>
          <p className="col-span-2 text-[8pt] text-gray-600">
            Check this report at <span className="font-mono">{appUrl}/verify/{r.reportSerial}</span>. The check shows the lab, date, test and status, never results.
          </p>
        </footer>
      </article>
    </main>
  );
}
