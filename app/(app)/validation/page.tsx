import { ShieldCheck } from 'lucide-react';
import { requireUser } from '@/lib/auth/guards';
import { validationQueue } from '@/lib/worklists';
import { EmptyState, Mono, PageHeader, Panel } from '@/components/ui/Panel';
import { LiveRefresh } from '@/components/orders/LiveRefresh';
import { WorkTable } from '@/components/work/WorkTable';

export const metadata = { title: 'Validation' };

export default async function ValidationPage() {
  const me = await requireUser(['admin', 'signatory']);
  const now = new Date();
  const rows = await validationQueue(me.labId, now);
  const critical = rows.filter((r) => r.critical).length;
  return (
    <>
      <PageHeader
        title="Validation"
        subtitle={
          <>
            <Mono>{rows.length}</Mono> {rows.length === 1 ? 'result' : 'results'} to review
            {critical > 0 && (
              <>
                {' '}
                · <Mono>{critical}</Mono> with a critical value
              </>
            )}
            . You can’t release a result you entered.
          </>
        }
        actions={<LiveRefresh renderedAt={now.toISOString()} />}
      />
      {rows.length === 0 ? (
        <Panel>
          <EmptyState icon={<ShieldCheck className="h-5 w-5" strokeWidth={1.75} />} title="Nothing to review" hint="Results sent for validation appear here." />
        </Panel>
      ) : (
        <WorkTable rows={rows} now={now} mode="validation" />
      )}
    </>
  );
}
