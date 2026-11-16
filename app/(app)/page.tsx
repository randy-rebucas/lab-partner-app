import Link from 'next/link';
import { CalendarCheck, ClipboardCheck, Inbox, ListChecks, Send, type LucideIcon } from 'lucide-react';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { requireUser } from '@/lib/auth/guards';
import { hasAnyRole } from '@/lib/auth/roles';
import { worklistSummary } from '@/lib/worklists';
import { dailyTrend, manilaDate, ordersByClinic, pipeline, turnaroundBySection } from '@/lib/dashboard';
import { Mono, Panel, PanelHeader } from '@/components/ui/Panel';
import { LiveRefresh } from '@/components/orders/LiveRefresh';
import { Photo } from '@/components/Photo';
import { RankedBars, TatBars, TrendChart } from '@/components/charts/charts';
import { SERIES } from '@/components/charts/palette';
import { Delivery } from '@/models/Delivery';

export const metadata = { title: 'Today' };

type Tile = { label: string; value: number; href: string; note: string; icon: LucideIcon; tone?: 'amber' | 'red' };

function TileCard({ t }: { t: Tile }) {
  const hot = t.value > 0 && t.tone;
  const chip = hot === 'red' ? 'bg-red-50 text-red-700' : hot === 'amber' ? 'bg-amber-50 text-amber-800' : 'bg-brand-teal-light text-brand-teal-dark';
  const note = hot === 'red' ? 'text-red-700' : hot === 'amber' ? 'text-amber-800' : 'text-gray-500';
  const Icon = t.icon;
  return (
    <Link
      href={t.href}
      className="flex h-full flex-col rounded-lg border border-gray-200 bg-white px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-gray-600">{t.label}</span>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${chip}`} aria-hidden="true">
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </span>
      </span>
      <span className="mt-1 text-3xl font-extrabold tracking-tight text-gray-900">
        <Mono>{t.value}</Mono>
      </span>
      <span className={`mt-1 text-xs ${note}`}>{t.note}</span>
    </Link>
  );
}

// Tiles fill the row for however many this person's roles show (2 to 5), so no row ends in a gap.
const TILE_COLS: Record<number, string> = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-3 xl:grid-cols-5' };

function greeting(now: Date): string {
  const hour = Number(now.toLocaleString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', hour12: false })) % 24;
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

/** What needs doing now, for the roles this person has, and how the lab is doing. */
export default async function TodayPage() {
  const user = await requireUser();
  const now = new Date();
  const r = user.roles;
  const seesTat = hasAnyRole(r, ['admin', 'medtech', 'signatory']);
  const seesClinics = hasAnyRole(r, ['admin', 'front-desk', 'signatory']);
  await connectDB();
  const labId = new Types.ObjectId(user.labId);
  const [stages, flagged, retrying, bench, trend, tat, clinics] = await Promise.all([
    pipeline(user.labId),
    Delivery.countDocuments({ labId, flagged: true, deliveredAt: null }),
    Delivery.countDocuments({ labId, flagged: false, deliveredAt: null, attempts: { $gt: 0 } }),
    worklistSummary(user.labId, now),
    dailyTrend(user.labId, now, 14),
    seesTat ? turnaroundBySection(user.labId, now, 30) : Promise.resolve([]),
    seesClinics ? ordersByClinic(user.labId, now, 30) : Promise.resolve([]),
  ]);
  const stage = (key: string) => stages.find((s) => s.key === key)!;
  const atBench = bench.reduce((n, s) => n + s.waiting, 0);
  const overdue = bench.reduce((n, s) => n + s.overdue, 0);
  const statOpen = stages.slice(0, 4).reduce((n, s) => n + s.stat, 0);

  const tiles: Tile[] = [];
  if (hasAnyRole(r, ['admin', 'front-desk', 'medtech', 'signatory']))
    tiles.push({ label: 'New orders', value: stage('new').count, href: '/orders', note: stage('new').stat ? `${stage('new').stat} STAT among them` : 'to accept or reject', icon: Inbox, tone: stage('new').stat ? 'red' : undefined });
  if (hasAnyRole(r, ['admin', 'front-desk', 'phlebotomist']))
    tiles.push({ label: 'Waiting for specimen', value: stage('specimen').count, href: '/check-in', note: 'check in and collect', icon: CalendarCheck });
  if (hasAnyRole(r, ['admin', 'medtech', 'signatory']))
    tiles.push({ label: 'At the bench', value: atBench, href: '/worklists', note: overdue ? `${overdue} past the turnaround target` : 'all within target', icon: ListChecks, tone: overdue ? 'amber' : undefined });
  if (hasAnyRole(r, ['admin', 'signatory']))
    tiles.push({ label: 'To validate', value: stage('validation').count, href: '/validation', note: 'results waiting for a signatory', icon: ClipboardCheck });
  if (hasAnyRole(r, ['admin', 'front-desk', 'signatory']))
    tiles.push({ label: 'Deliveries to fix', value: flagged, href: '/deliveries', note: `${retrying} retrying by themselves`, icon: Send, tone: 'red' });

  // Greet by first name, not by title: "Dr. Patricia Lim" → Patricia.
  const firstName = user.name.replace(/^(dr|dra|atty|engr|mr|mrs|ms)\.?\s+/i, '').split(' ')[0];
  const dateLine = now.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const receivedToday = trend[trend.length - 1]?.received ?? 0;
  const releasedToday = trend[trend.length - 1]?.released ?? 0;
  const received14 = trend.reduce((n, d) => n + d.received, 0);
  const released14 = trend.reduce((n, d) => n + d.released, 0);

  return (
    <>
      <section className="relative overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="relative z-10 flex flex-col gap-5 px-5 py-6 sm:px-7 sm:py-7 md:max-w-[60%]">
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-gray-500">{dateLine}</p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
              {greeting(now)}, {firstName}.
            </h1>
            <p className="mt-2 max-w-md text-sm text-gray-600">
              {statOpen > 0 ? (
                <>
                  <span className="font-semibold text-red-700">
                    <Mono>{statOpen}</Mono> STAT {statOpen === 1 ? 'order is' : 'orders are'} open.
                  </span>{' '}
                </>
              ) : null}
              <Mono>{receivedToday}</Mono> {receivedToday === 1 ? 'order' : 'orders'} received and <Mono>{releasedToday}</Mono> {releasedToday === 1 ? 'report' : 'reports'} released so far
              today.
            </p>
          </div>
          <div>
            <LiveRefresh renderedAt={now.toISOString()} />
          </div>
        </div>
        <div className="absolute inset-y-0 right-0 hidden w-[44%] md:block" aria-hidden="true">
          <Photo name="today" sizes="(min-width: 1280px) 560px, 44vw" eager />
          <div className="absolute inset-y-0 left-0 w-px bg-gray-200" />
        </div>
      </section>

      {tiles.length ? (
        <ul className={`grid gap-4 sm:grid-cols-2 ${TILE_COLS[tiles.length] ?? ''}`}>
          {tiles.map((t) => (
            <li key={t.label}>
              <TileCard t={t} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-600">Use the menu to open your work.</p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel className="overflow-hidden lg:col-span-2">
          <PanelHeader
            title="Orders and reports, last 14 days"
            subtitle={
              <>
                <Mono>{received14}</Mono> orders received, <Mono>{released14}</Mono> reports released.
              </>
            }
          />
          <TrendChart
            days={trend}
            today={manilaDate(now)}
            unit="order"
            caption="Orders received and reports released per day, last 14 days"
            series={[
              { key: 'received', label: 'Orders received', color: SERIES.teal, kind: 'column' },
              { key: 'released', label: 'Reports released', color: SERIES.blue, kind: 'line' },
            ]}
          />
        </Panel>
        <Panel className="overflow-hidden">
          <PanelHeader title="Where orders are now" subtitle="Open orders by step. Select a step to open it." />
          <RankedBars
            caption="Open orders by step"
            valueHead="Orders"
            empty="No open orders. New ones from clinics appear here as they arrive."
            rows={stages.map((s) => ({
              label: s.label,
              value: s.count,
              href: s.href,
              note: s.stat ? <span className="font-semibold text-red-700">{s.stat} STAT</span> : undefined,
            }))}
          />
        </Panel>
      </div>

      {(seesTat || seesClinics) && (
        <div className={`grid gap-6 ${seesTat && seesClinics ? 'lg:grid-cols-2' : ''}`}>
          {seesTat && (
            <Panel className="overflow-hidden">
              <PanelHeader title="Turnaround, last 30 days" subtitle="Share of reports released within each test’s target, from collection. The tick marks the 90% goal." />
              <TatBars rows={tat} caption="Reports released within target per section, last 30 days" />
            </Panel>
          )}
          {seesClinics && (
            <Panel className="overflow-hidden">
              <PanelHeader title="Orders by clinic, last 30 days" subtitle="Which connected clinics send the most work." />
              <RankedBars caption="Orders per clinic, last 30 days" valueHead="Orders" empty="No orders in the last 30 days." rows={clinics.map((c) => ({ label: c.name, value: c.orders }))} />
            </Panel>
          )}
        </div>
      )}
    </>
  );
}
