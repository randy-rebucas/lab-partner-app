'use client';

import { useState } from 'react';
import Link from 'next/link';
import { OrderStatusBadge, UrgencyBadge } from '@/components/OrderStatusBadge';
import { Mono, Panel, PanelHeader } from '@/components/ui/Panel';
import { StatusLine } from '@/components/ui/StatusLine';
import { OrderActions } from '@/components/orders/OrderActions';
import { ageText, elapsed, manilaWhen } from '@/lib/time';
import type { InboxGroup, InboxView } from '@/lib/orders/inbox';
import type { OrderActionResult } from './actions';

export function InboxList({ groups, view, canDecide, nowIso }: { groups: InboxGroup[]; view: InboxView; canDecide: boolean; nowIso: string }) {
  const [result, setResult] = useState<OrderActionResult | null>(null);
  const now = new Date(nowIso);
  return (
    <div className="space-y-6">
      {result && (
        <StatusLine tone={result.ok ? 'success' : 'error'} onDismiss={() => setResult(null)}>
          {result.ok ? result.message : result.error}
        </StatusLine>
      )}
      {groups.map((g) => {
        const stat = g.rows.filter((r) => r.urgency === 'stat').length;
        return (
          <Panel key={g.clinicId} className="overflow-hidden">
            <PanelHeader
              title={g.clinicName}
              subtitle={
                <>
                  <Mono>{g.rows.length}</Mono> {g.rows.length === 1 ? 'order' : 'orders'}
                  {stat > 0 && (
                    <>
                      {' '}
                      · <Mono>{stat}</Mono> STAT
                    </>
                  )}
                </>
              }
            />
            <ul className="divide-y divide-gray-100">
              {g.rows.map((r) => {
                const age = ageText(r.dateOfBirth, now);
                const label = `${r.patientName} · ${r.testName}`;
                return (
                  <li
                    key={r.id}
                    className="grid grid-cols-1 gap-2 px-5 py-3.5 md:grid-cols-[6rem_minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.2fr)_auto] md:items-center md:gap-4"
                  >
                    <div>
                      <UrgencyBadge urgency={r.urgency} />
                    </div>
                    <div className="min-w-0">
                      <Link
                        href={`/orders/${r.id}`}
                        className="block truncate rounded text-sm font-semibold text-gray-900 hover:text-brand-teal-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
                      >
                        {r.patientName}
                      </Link>
                      <p className="text-xs text-gray-500">
                        {[age, r.sex === 'male' ? 'Male' : r.sex === 'female' ? 'Female' : null].filter(Boolean).join(' · ') || 'Age and sex not sent'}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-gray-900">{r.testName}</p>
                      <p className="truncate text-xs text-gray-500">
                        <Mono>{r.requestCode}</Mono>
                        {r.clinicTestName && <> · sent as “{r.clinicTestName}”</>}
                      </p>
                    </div>
                    <div className="text-sm text-gray-600">
                      {view === 'rejected' ? (
                        <p className="text-xs text-red-700">{r.rejectReason}</p>
                      ) : view === 'new' || view === 'accepted' ? (
                        <>
                          <p>
                            <Mono>{manilaWhen(r.receivedAt, now)}</Mono>
                          </p>
                          <p className="text-xs text-gray-500">
                            waiting <Mono>{elapsed(r.receivedAt, now)}</Mono>
                          </p>
                        </>
                      ) : (
                        <OrderStatusBadge status={r.status} />
                      )}
                    </div>
                    <div className="flex md:justify-end">
                      {canDecide && (view === 'new' || view === 'accepted') ? (
                        <OrderActions orderId={r.id} label={label} canAccept={r.status === 'received'} canReject onResult={setResult} />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
        );
      })}
    </div>
  );
}
