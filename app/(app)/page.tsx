import Link from 'next/link';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { requireUser } from '@/lib/auth/guards';
import { hasAnyRole } from '@/lib/auth/roles';
import { worklistSummary } from '@/lib/worklists';
import { Mono, PageHeader } from '@/components/ui/Panel';
import { LiveRefresh } from '@/components/orders/LiveRefresh';
import { Delivery } from '@/models/Delivery';
import { Order } from '@/models/Order';

export const metadata = { title: 'Today' };

type Tile = { label: string; value: number; href: string; note?: string; tone?: 'amber' | 'red' };

function TileCard({ t }: { t: Tile }) {
  const tone = t.tone === 'red' && t.value > 0 ? 'text-red-700' : t.tone === 'amber' && t.value > 0 ? 'text-amber-800' : 'text-gray-900';
  return (
    <Link
      href={t.href}
      className="block rounded-lg border border-gray-200 bg-white px-5 py-4 hover:border-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
    >
      <p className="text-sm font-semibold text-gray-600">{t.label}</p>
      <p className={`mt-2 text-3xl font-extrabold tracking-tight ${tone}`}>
        <Mono>{t.value}</Mono>
      </p>
      {t.note && <p className="mt-1 text-xs text-gray-500">{t.note}</p>}
    </Link>
  );
}

/** What needs doing now, for the roles this person has. */
export default async function TodayPage() {
  const user = await requireUser();
  const now = new Date();
  await connectDB();
  const labId = new Types.ObjectId(user.labId);
  const count = (statuses: string[]) => Order.countDocuments({ labId, status: { $in: statuses } });
  const [received, waiting, validation, flagged, retrying, bench] = await Promise.all([
    count(['received']),
    count(['accepted']),
    count(['awaiting-validation']),
    Delivery.countDocuments({ labId, flagged: true, deliveredAt: null }),
    Delivery.countDocuments({ labId, flagged: false, deliveredAt: null, attempts: { $gt: 0 } }),
    worklistSummary(user.labId, now),
  ]);
  const atBench = bench.reduce((n, s) => n + s.waiting, 0);
  const overdue = bench.reduce((n, s) => n + s.overdue, 0);
  const r = user.roles;
  const tiles: Tile[] = [];
  if (hasAnyRole(r, ['admin', 'front-desk', 'medtech', 'signatory'])) tiles.push({ label: 'New orders', value: received, href: '/orders', note: 'to accept or reject' });
  if (hasAnyRole(r, ['admin', 'front-desk', 'phlebotomist'])) tiles.push({ label: 'Waiting for specimen', value: waiting, href: '/check-in', note: 'check in and collect' });
  if (hasAnyRole(r, ['admin', 'medtech', 'signatory']))
    tiles.push({ label: 'At the bench', value: atBench, href: '/worklists', note: `${overdue} past the turnaround target`, tone: overdue ? 'amber' : undefined });
  if (hasAnyRole(r, ['admin', 'signatory'])) tiles.push({ label: 'To validate', value: validation, href: '/validation', note: 'results waiting for a signatory' });
  if (hasAnyRole(r, ['admin', 'front-desk', 'signatory']))
    tiles.push({ label: 'Deliveries needing attention', value: flagged, href: '/deliveries', note: `${retrying} retrying by themselves`, tone: 'red' });
  // Greet by first name, not by title: "Dr. Patricia Lim" → Patricia.
  const firstName = user.name.replace(/^(dr|dra|atty|engr|mr|mrs|ms)\.?\s+/i, '').split(' ')[0];
  return (
    <>
      <PageHeader title="Today" subtitle={`Good to see you, ${firstName}. Here is what is waiting.`} actions={<LiveRefresh renderedAt={now.toISOString()} />} />
      {tiles.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <li key={t.label}>
              <TileCard t={t} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-600">Use the menu to open your work.</p>
      )}
    </>
  );
}
