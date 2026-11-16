import Link from 'next/link';
import { requireUser } from '@/lib/auth/guards';
import { worklistSummary } from '@/lib/worklists';
import { Mono, PageHeader } from '@/components/ui/Panel';
import { LiveRefresh } from '@/components/orders/LiveRefresh';

export const metadata = { title: 'Worklists' };

export default async function WorklistsPage() {
  const me = await requireUser(['admin', 'medtech', 'signatory']);
  const now = new Date();
  const sections = await worklistSummary(me.labId, now);
  return (
    <>
      <PageHeader
        title="Worklists"
        subtitle="Collected specimens waiting at each bench. Open a section to enter results."
        actions={<LiveRefresh renderedAt={now.toISOString()} />}
      />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => (
          <li key={s.slug}>
            <Link
              href={`/worklists/${s.slug}`}
              className="block rounded-lg border border-gray-200 bg-white px-5 py-4 hover:border-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
            >
              <p className="text-sm font-semibold text-gray-900">{s.section}</p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-gray-900">
                <Mono>{s.waiting}</Mono>
              </p>
              <p className="mt-1 text-xs text-gray-600">
                waiting
                {s.overdue > 0 && (
                  <span className="font-semibold text-amber-800">
                    {' '}
                    · <Mono>{s.overdue}</Mono> overdue
                  </span>
                )}
                {s.stat > 0 && (
                  <span className="font-semibold text-red-700">
                    {' '}
                    · <Mono>{s.stat}</Mono> STAT
                  </span>
                )}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
