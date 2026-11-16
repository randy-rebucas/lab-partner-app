import 'server-only';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { SECTIONS } from '@/lib/catalog/names';
import { ConnectedClinic } from '@/models/ConnectedClinic';
import { Order } from '@/models/Order';
import { Result } from '@/models/Result';
import { Specimen } from '@/models/Specimen';
import { TestDefinition } from '@/models/TestDefinition';

// Figures for the Today page charts. Every figure is an aggregate: no patient details leave here.
// Days are Manila calendar days (lib/time.ts).

const TZ = 'Asia/Manila';

export const manilaDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });
const manilaMidnight = (date: string) => new Date(`${date}T00:00:00+08:00`);

/** The last `n` Manila dates, oldest first, ending today. */
export function lastDays(now: Date, n: number): string[] {
  const today = manilaMidnight(manilaDate(now));
  return Array.from({ length: n }, (_, i) => manilaDate(new Date(today.getTime() - (n - 1 - i) * 86_400_000 + 12 * 3_600_000)));
}

export type TrendDay = { date: string; received: number; released: number };

/** Orders received and reports first released, per day, for the last `n` days. */
export async function dailyTrend(labId: string, now: Date, n = 14): Promise<TrendDay[]> {
  await connectDB();
  const days = lastDays(now, n);
  const since = manilaMidnight(days[0]);
  const lab = new Types.ObjectId(labId);
  const byDay = (field: string) => ({ $dateToString: { format: '%Y-%m-%d', date: `$${field}`, timezone: TZ } });
  const [received, released] = await Promise.all([
    Order.aggregate<{ _id: string; n: number }>([{ $match: { labId: lab, receivedAt: { $gte: since } } }, { $group: { _id: byDay('receivedAt'), n: { $sum: 1 } } }]),
    Result.aggregate<{ _id: string; n: number }>([
      { $match: { labId: lab, releasedAt: { $gte: since }, version: 1 } },
      { $group: { _id: byDay('releasedAt'), n: { $sum: 1 } } },
    ]),
  ]);
  const r = new Map(received.map((x) => [x._id, x.n]));
  const s = new Map(released.map((x) => [x._id, x.n]));
  return days.map((date) => ({ date, received: r.get(date) ?? 0, released: s.get(date) ?? 0 }));
}

export type Stage = { key: string; label: string; count: number; href: string; stat: number };

/** Where open orders are right now, in the order work flows. */
export async function pipeline(labId: string): Promise<Stage[]> {
  await connectDB();
  const rows = await Order.aggregate<{ _id: string; n: number; stat: number }>([
    { $match: { labId: new Types.ObjectId(labId), status: { $in: ['received', 'accepted', 'collected', 'in-progress', 'awaiting-validation', 'released'] } } },
    { $group: { _id: '$status', n: { $sum: 1 }, stat: { $sum: { $cond: [{ $eq: ['$urgency', 'stat'] }, 1, 0] } } } },
  ]);
  const of = (...s: string[]) => rows.filter((r) => s.includes(r._id)).reduce((a, r) => ({ n: a.n + r.n, stat: a.stat + r.stat }), { n: 0, stat: 0 });
  const stage = (key: string, label: string, href: string, ...s: string[]): Stage => {
    const x = of(...s);
    return { key, label, href, count: x.n, stat: x.stat };
  };
  return [
    stage('new', 'New', '/orders', 'received'),
    stage('specimen', 'Waiting for specimen', '/check-in', 'accepted'),
    stage('bench', 'At the bench', '/worklists', 'collected', 'in-progress'),
    stage('validation', 'To validate', '/validation', 'awaiting-validation'),
    stage('sending', 'Released, sending', '/deliveries', 'released'),
  ];
}

export type SectionTat = { section: string; released: number; onTime: number; medianHours: number | null };

/** Turnaround per section for reports first released in the last `days` days: collection to release, against each test's target. */
export async function turnaroundBySection(labId: string, now: Date, days = 30): Promise<SectionTat[]> {
  await connectDB();
  const lab = new Types.ObjectId(labId);
  const since = new Date(now.getTime() - days * 86_400_000);
  const results = await Result.find({ labId: lab, releasedAt: { $gte: since }, version: 1 }).select('orderId releasedAt').limit(5000).lean();
  const orders = await Order.find({ _id: { $in: results.map((r) => r.orderId) } }).select('specimenId test.testId receivedAt').lean();
  const [specimens, tests] = await Promise.all([
    Specimen.find({ _id: { $in: orders.map((o) => o.specimenId).filter(Boolean) } }).select('collectedAt').lean(),
    TestDefinition.find({ labId: lab }).select('section turnaroundHours').lean(),
  ]);
  const orderOf = new Map(orders.map((o) => [String(o._id), o]));
  const collected = new Map(specimens.map((s) => [String(s._id), s.collectedAt]));
  const testOf = new Map(tests.map((t) => [String(t._id), t]));

  const per = new Map<string, { hours: number[]; onTime: number }>();
  for (const r of results) {
    const o = orderOf.get(String(r.orderId));
    if (!o || !r.releasedAt) continue;
    const t = testOf.get(String(o.test?.testId));
    const from = collected.get(String(o.specimenId)) ?? o.receivedAt;
    const hours = (new Date(r.releasedAt).getTime() - new Date(from).getTime()) / 3_600_000;
    const section = t?.section ?? 'Other';
    const entry = per.get(section) ?? { hours: [], onTime: 0 };
    entry.hours.push(hours);
    if (hours <= (t?.turnaroundHours ?? 24)) entry.onTime += 1;
    per.set(section, entry);
  }
  return SECTIONS.map((section) => {
    const e = per.get(section);
    if (!e) return { section, released: 0, onTime: 0, medianHours: null };
    const sorted = [...e.hours].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    return { section, released: sorted.length, onTime: e.onTime, medianHours: median };
  }).filter((s) => s.released > 0);
}

export type ClinicShare = { name: string; orders: number };

/** Orders per connected clinic over the last `days` days, busiest first; past `top`, the rest fold into one row. */
export async function ordersByClinic(labId: string, now: Date, days = 30, top = 5): Promise<ClinicShare[]> {
  await connectDB();
  const since = new Date(now.getTime() - days * 86_400_000);
  const rows = await Order.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { labId: new Types.ObjectId(labId), receivedAt: { $gte: since } } },
    { $group: { _id: '$clinicId', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ]);
  const names = new Map((await ConnectedClinic.find({ _id: { $in: rows.slice(0, top).map((r) => r._id) } }).select('name').lean()).map((c) => [String(c._id), c.name]));
  const shares: ClinicShare[] = rows.slice(0, top).map((r) => ({ name: names.get(String(r._id)) ?? 'Removed clinic', orders: r.n }));
  const rest = rows.slice(top);
  if (rest.length) shares.push({ name: `${rest.length} other clinic${rest.length === 1 ? '' : 's'}`, orders: rest.reduce((n, r) => n + r.n, 0) });
  return shares;
}
