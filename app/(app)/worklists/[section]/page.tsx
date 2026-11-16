import { notFound } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { requireUser } from '@/lib/auth/guards';
import { sectionFromSlug, sectionWorklist } from '@/lib/worklists';
import { EmptyState, Mono, PageHeader, Panel } from '@/components/ui/Panel';
import { LiveRefresh } from '@/components/orders/LiveRefresh';
import { WorkTable } from '@/components/work/WorkTable';

export const metadata = { title: 'Worklist' };

export default async function SectionWorklistPage({ params }: { params: Promise<{ section: string }> }) {
  const me = await requireUser(['admin', 'medtech', 'signatory']);
  const section = sectionFromSlug((await params).section);
  if (!section) notFound();
  const now = new Date();
  const rows = await sectionWorklist(me.labId, section, now);
  const overdue = rows.filter((r) => r.tat !== 'on-time').length;
  return (
    <>
      <PageHeader
        title={section}
        subtitle={
          <>
            <Mono>{rows.length}</Mono> waiting
            {overdue > 0 && (
              <>
                {' '}
                · <Mono>{overdue}</Mono> past the turnaround target
              </>
            )}
            . STAT first, then the oldest collection.
          </>
        }
        actions={<LiveRefresh renderedAt={now.toISOString()} />}
      />
      {rows.length === 0 ? (
        <Panel>
          <EmptyState icon={<ClipboardList className="h-5 w-5" strokeWidth={1.75} />} title="Nothing waiting" hint="Specimens for this section appear here once collected." />
        </Panel>
      ) : (
        <WorkTable rows={rows} now={now} mode="bench" />
      )}
    </>
  );
}
