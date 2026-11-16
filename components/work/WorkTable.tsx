import Link from 'next/link';
import { OrderStatusBadge, UrgencyBadge } from '@/components/OrderStatusBadge';
import { Badge } from '@/components/ui/Badge';
import { Mono, Panel } from '@/components/ui/Panel';
import { ageText, elapsed } from '@/lib/time';
import type { WorkRow } from '@/lib/worklists';

/** Elapsed since collection against the target: amber past it, red past twice it, always with words. */
export function Turnaround({ row, now }: { row: WorkRow; now: Date }) {
  const cls = row.tat === 'very-overdue' ? 'text-red-700' : row.tat === 'overdue' ? 'text-amber-800' : 'text-gray-900';
  return (
    <div className="text-sm">
      <p className={cls}>
        <Mono className={row.tat === 'on-time' ? '' : 'font-semibold'}>{elapsed(row.collectedAt, now)}</Mono>
        {row.tat !== 'on-time' && <span className="ml-1.5 text-xs font-semibold">{row.tat === 'very-overdue' ? 'Overdue ×2' : 'Overdue'}</span>}
      </p>
      <p className="text-xs text-gray-500">
        target <Mono>{row.targetHours} h</Mono>
      </p>
    </div>
  );
}

export function WorkTable({ rows, now, mode }: { rows: WorkRow[]; now: Date; mode: 'bench' | 'validation' }) {
  return (
    <Panel className="overflow-hidden">
      <ul className="divide-y divide-gray-100">
        {rows.map((r) => {
          const age = ageText(r.sexAge.dateOfBirth, now);
          return (
            <li key={r.orderId} className={r.critical && mode === 'validation' ? 'bg-red-50' : ''}>
              <Link
                href={`/results/${r.orderId}`}
                className="grid grid-cols-1 gap-2 px-5 py-3.5 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal md:grid-cols-[8.5rem_6rem_minmax(0,2fr)_minmax(0,1.6fr)_8rem_auto] md:items-center md:gap-4"
              >
                <Mono className="text-sm font-semibold text-gray-900">{r.accessionNo || '—'}</Mono>
                <div>
                  <UrgencyBadge urgency={r.urgency} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{r.patientName}</p>
                  <p className="truncate text-xs text-gray-500">
                    {[age, r.sexAge.sex === 'male' ? 'Male' : r.sexAge.sex === 'female' ? 'Female' : null].filter(Boolean).join(' · ') || 'Age and sex not sent'} · {r.clinicName}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm text-gray-900">{r.testName}</p>
                  {mode === 'validation' && r.enteredBy && <p className="truncate text-xs text-gray-500">Entered by {r.enteredBy}</p>}
                  {mode === 'bench' && r.sentBack && <p className="truncate text-xs text-amber-800">Sent back: {r.sentBack}</p>}
                </div>
                <Turnaround row={r} now={now} />
                <div className="flex flex-wrap gap-2 md:justify-end">
                  {r.critical && <Badge tone="red">{mode === 'validation' && !r.criticalCalled ? 'Critical, call needed' : 'Critical'}</Badge>}
                  {mode === 'bench' && <OrderStatusBadge status={r.status} />}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
