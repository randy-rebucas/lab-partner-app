import Link from 'next/link';
import { requireUser } from '@/lib/auth/guards';
import { worklistSummary } from '@/lib/worklists';
import { Mono, PageHeader } from '@/components/ui/Panel';
import { LiveRefresh } from '@/components/orders/LiveRefresh';
import { Photo, sectionPhoto } from '@/components/Photo';

export const metadata = { title: 'Worklists' };

export default async function WorklistsPage() {
  const me = await requireUser(['admin', 'medtech', 'signatory']);
  const now = new Date();
  const sections = await worklistSummary(me.labId, now);
  const total = sections.reduce((n, s) => n + s.waiting, 0);
  const busiest = Math.max(1, ...sections.map((s) => s.waiting));
  return (
    <>
      <PageHeader
        title="Worklists"
        subtitle={
          <>
            <Mono>{total}</Mono> collected {total === 1 ? 'specimen is' : 'specimens are'} waiting at the benches. Open a section to enter results.
          </>
        }
        actions={<LiveRefresh renderedAt={now.toISOString()} />}
      />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s, i) => {
          const onTime = s.waiting - s.overdue;
          return (
            <li key={s.slug}>
              <Link
                href={`/worklists/${s.slug}`}
                className="group block overflow-hidden rounded-lg border border-gray-200 bg-white transition-colors hover:border-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
              >
                <div className="relative h-28 bg-gray-100">
                  <Photo name={sectionPhoto(s.section)} sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw" className={`transition-[filter] duration-300 ${s.waiting ? '' : 'grayscale'}`} />
                  {s.stat > 0 && (
                    <span className="absolute left-3 top-3 rounded bg-red-700 px-2 py-0.5 text-xs font-semibold text-white">
                      <Mono>{s.stat}</Mono> STAT
                    </span>
                  )}
                </div>
                <div className="px-5 py-4 group-hover:bg-gray-50">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-semibold text-gray-900">{s.section}</p>
                    <p className="text-3xl font-extrabold tracking-tight text-gray-900">
                      <Mono>{s.waiting}</Mono>
                    </p>
                  </div>
                  {/* Waiting work against the busiest bench: on time in teal, overdue in amber. Decorative; the words carry the figures. */}
                  <div className="mt-3 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
                    {onTime > 0 && <span className="motion-bar-grow h-full bg-chart-teal" style={{ width: `${(onTime / busiest) * 100}%`, animationDelay: `${i * 50}ms` }} />}
                    {s.overdue > 0 && <span className="motion-bar-grow h-full bg-state-pending" style={{ width: `${(s.overdue / busiest) * 100}%`, animationDelay: `${i * 50}ms` }} />}
                  </div>
                  <p className="mt-2 text-xs text-gray-600">
                    {s.waiting === 0 ? (
                      'Nothing waiting'
                    ) : s.overdue > 0 ? (
                      <>
                        <Mono>{onTime}</Mono> on time ·{' '}
                        <span className="font-semibold text-amber-800">
                          <Mono>{s.overdue}</Mono> overdue
                        </span>
                      </>
                    ) : (
                      'All within the turnaround target'
                    )}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
