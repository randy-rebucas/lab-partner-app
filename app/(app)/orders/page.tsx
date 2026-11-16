import Link from 'next/link';
import { Inbox, Search } from 'lucide-react';
import { requireUser } from '@/lib/auth/guards';
import { hasAnyRole } from '@/lib/auth/roles';
import { inbox, inboxCounts, INBOX_LIMIT, INBOX_VIEWS, isInboxView, type InboxView } from '@/lib/orders/inbox';
import { buttonClass } from '@/components/ui/Button';
import { inputClass } from '@/components/ui/Field';
import { EmptyState, PageHeader, Panel } from '@/components/ui/Panel';
import { LiveRefresh } from '@/components/orders/LiveRefresh';
import { InboxList } from './InboxList';

export const metadata = { title: 'Order inbox' };

const EMPTY: Record<InboxView, { title: string; hint: string }> = {
  new: { title: 'No new orders', hint: 'Orders from connected clinics appear here as they arrive. This list updates by itself.' },
  accepted: { title: 'Nothing waiting for a specimen', hint: 'Accepted orders wait here until the specimen is collected at check-in.' },
  'in-lab': { title: 'Nothing in the lab', hint: 'Orders move here once their specimen is collected.' },
  done: { title: 'Nothing released in the last 7 days', hint: 'Released results stay listed here for a week.' },
  rejected: { title: 'No rejected orders in the last 30 days', hint: 'Rejected orders and their reasons stay listed here for 30 days.' },
};

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  const me = await requireUser(['admin', 'front-desk', 'medtech', 'signatory']);
  const sp = await searchParams;
  const view: InboxView = isInboxView(sp.view) ? sp.view : 'new';
  const q = (sp.q ?? '').slice(0, 80);
  const now = new Date();
  const [{ groups, total, truncated }, counts] = await Promise.all([inbox(me.labId, view, q, now), inboxCounts(me.labId, now)]);
  const canDecide = hasAnyRole(me.roles, ['admin', 'front-desk', 'medtech']);
  const href = (v: InboxView) => `/orders?view=${v}${q ? `&q=${encodeURIComponent(q)}` : ''}`;

  return (
    <>
      <PageHeader
        title="Order inbox"
        subtitle={`${counts.new} new ${counts.new === 1 ? 'order' : 'orders'} from connected clinics. STAT and urgent orders are listed first.`}
        actions={<LiveRefresh renderedAt={now.toISOString()} />}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Order views" className="flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-white p-1">
          {(Object.keys(INBOX_VIEWS) as InboxView[]).map((v) => (
            <Link
              key={v}
              href={href(v)}
              aria-current={v === view ? 'page' : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal ${
                v === view ? 'bg-brand-teal-light text-brand-teal-deep' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {INBOX_VIEWS[v].label} <span className="font-mono tabular-nums text-xs">{counts[v]}</span>
            </Link>
          ))}
        </nav>
        <form role="search" className="flex gap-2" action="/orders">
          <input type="hidden" name="view" value={view} />
          <label htmlFor="q" className="sr-only">
            Search patient or request code
          </label>
          <input id="q" name="q" defaultValue={q} placeholder="Patient or request code" className={`${inputClass} w-56`} />
          <button type="submit" className={buttonClass('secondary', 'sm')} aria-label="Search">
            <Search className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </form>
      </div>

      {groups.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Inbox className="h-5 w-5" strokeWidth={1.75} />}
            title={q ? `No orders match “${q}”` : EMPTY[view].title}
            hint={q ? 'Search looks at the patient’s name, patient code and the clinic’s request code.' : EMPTY[view].hint}
          />
        </Panel>
      ) : (
        <InboxList groups={groups} view={view} canDecide={canDecide} nowIso={now.toISOString()} />
      )}
      {truncated && (
        <p className="text-sm text-gray-600">
          Showing the first <span className="font-mono tabular-nums">{INBOX_LIMIT}</span> of more orders. Search to narrow the list.
        </p>
      )}
      {total > 0 && !truncated && (
        <p className="text-xs text-gray-500">
          <span className="font-mono tabular-nums">{total}</span> {total === 1 ? 'order' : 'orders'}
        </p>
      )}
    </>
  );
}
