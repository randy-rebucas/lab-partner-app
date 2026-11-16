'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Hand-drawn SVG/HTML charts in the MyClinicSoft console's grammar (DESIGN.md "Data Visualization",
// ported from clinic-management/components/dashboards/charts.tsx): hairline grid, Mono figures,
// flat marks, a tooltip on every mark and a "View as table" twin. Palette validated there.

import { SERIES } from './palette';
const GRID = '#E5E7EB';
const TEAL_DARK = '#0A7F7E';
const AMBER = '#D97706';

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceMax(value: number) {
  if (value <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(value));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * pow >= value) return m * pow;
  return 10 * pow;
}

const dayFmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-PH', opts);

// ---------------------------------------------------------------------------
// Tooltip: one fixed-position readout, so a scroll box never clips it
// ---------------------------------------------------------------------------

type TipState = { x: number; y: number; content: ReactNode };

function useTooltip() {
  const [tip, setTip] = useState<TipState | null>(null);
  const hide = useCallback(() => setTip(null), []);
  const showAt = useCallback((x: number, y: number, content: ReactNode) => setTip({ x, y, content }), []);
  const showFor = useCallback((el: Element, content: ReactNode) => {
    const r = el.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, y: r.top, content });
  }, []);
  useEffect(() => {
    if (!tip) return;
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [tip, hide]);
  const node =
    tip && typeof document !== 'undefined'
      ? createPortal(
          <div role="presentation" className="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-full pb-2" style={{ left: tip.x, top: tip.y }}>
            <div className="min-w-[9rem] rounded-md bg-white px-3 py-2 text-sm shadow-[0_8px_30px_rgb(15,23,42,0.14)] ring-1 ring-gray-200">{tip.content}</div>
          </div>,
          document.body
        )
      : null;
  return { showAt, showFor, hide, node };
}

function TipRow({ color, kind, label, value }: { color: string; kind: 'line' | 'bar'; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="flex items-center gap-2 text-gray-600">
        <span aria-hidden="true" className={kind === 'line' ? 'h-0.5 w-3 rounded-full' : 'h-2.5 w-2.5 rounded-sm'} style={{ background: color }} />
        {label}
      </span>
      <span className="font-mono font-semibold tabular-nums text-gray-900">{value}</span>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; kind: 'line' | 'bar' }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={item.kind === 'line' ? 'h-0.5 w-3.5 rounded-full' : 'h-2.5 w-2.5 rounded-sm'} style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function TableTwin({ caption, head, rows }: { caption: string; head: string[]; rows: ReactNode[][] }) {
  return (
    <details className="group border-t border-gray-100">
      <summary className="cursor-pointer select-none list-none px-5 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-1.5">
          <svg className="h-3.5 w-3.5 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5l7 7-7 7" />
          </svg>
          View as table
        </span>
      </summary>
      <div className="max-h-72 overflow-auto px-5 pb-4">
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-left text-gray-500">
              {head.map((h, i) => (
                <th key={h} scope="col" className={`py-1.5 pr-3 font-medium ${i > 0 ? 'text-right' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c} className={`py-1.5 pr-3 ${c > 0 ? 'text-right font-mono tabular-nums text-gray-900' : 'text-gray-700'}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Trend chart: columns and a line on one shared count axis, with a crosshair
// ---------------------------------------------------------------------------

export type TrendSeries = { key: string; label: string; color: string; kind: 'column' | 'line' };
export type TrendPoint = { date: string } & Record<string, number | string>;

const PLOT_H = 220;
const AXIS_H = 28;
const PAD_L = 36;
const PAD_R = 12;
const PAD_T = 12;

export function TrendChart({ days, today, series, caption, unit }: { days: TrendPoint[]; today: string; series: TrendSeries[]; caption: string; unit: string }) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const tip = useTooltip();
  const [active, setActive] = useState<number | null>(null);
  const id = useId();

  const lastIdx = Math.max(0, days.findIndex((d) => d.date === today) === -1 ? days.length - 1 : days.findIndex((d) => d.date === today));
  const val = (d: TrendPoint, k: string) => Number(d[k]) || 0;
  const max = niceMax(Math.max(1, ...days.flatMap((d) => series.map((s) => val(d, s.key)))));
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
  const plotW = Math.max(0, width - PAD_L - PAD_R);
  const band = days.length ? plotW / days.length : 0;
  const cx = (i: number) => PAD_L + band * i + band / 2;
  const y = (v: number) => PAD_T + PLOT_H - (v / max) * PLOT_H;
  const baseline = PAD_T + PLOT_H;
  const colW = Math.max(2, Math.min(24, band * 0.56));
  const columns = series.filter((s) => s.kind === 'column');
  const lines = series.filter((s) => s.kind === 'line');
  const fmt = (v: number) => `${v} ${v === 1 ? unit : `${unit}s`}`;

  const showIndex = (i: number, svg: SVGSVGElement) => {
    setActive(i);
    const r = svg.getBoundingClientRect();
    const d = days[i];
    tip.showAt(
      r.left + cx(i),
      r.top + PAD_T,
      <div>
        <p className="mb-1 text-xs font-medium text-gray-500">
          {dayFmt(d.date, { weekday: 'short', month: 'short', day: 'numeric' })}
          {d.date === today ? ' · today' : ''}
        </p>
        {series.map((s) => (
          <TipRow key={s.key} color={s.color} kind={s.kind === 'column' ? 'bar' : 'line'} label={s.label} value={val(d, s.key)} />
        ))}
      </div>
    );
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!band) return;
    const r = e.currentTarget.getBoundingClientRect();
    showIndex(Math.min(days.length - 1, Math.max(0, Math.floor((e.clientX - r.left - PAD_L) / band))), e.currentTarget);
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const cur = active ?? lastIdx;
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? days.length - 1 : Math.min(days.length - 1, Math.max(0, cur + (e.key === 'ArrowLeft' ? -1 : 1)));
    showIndex(next, e.currentTarget);
  };
  const clear = () => {
    setActive(null);
    tip.hide();
  };
  const path = (k: string) => days.map((d, i) => `${i === 0 ? 'M' : 'L'}${cx(i).toFixed(1)},${y(val(d, k)).toFixed(1)}`).join(' ');
  const labelEvery = days.length <= 14 ? (width < 480 ? 2 : 1) : 5;

  return (
    <div>
      <div className="px-5 pt-3">
        <Legend items={series.map((s) => ({ label: s.label, color: s.color, kind: s.kind === 'column' ? 'bar' : 'line' }))} />
      </div>
      <div ref={wrapRef} className="px-2 pb-1 pt-2">
        {width > 0 && (
          <svg
            width={width}
            height={PAD_T + PLOT_H + AXIS_H}
            role="img"
            aria-labelledby={`${id}-cap`}
            aria-describedby={`${id}-desc`}
            tabIndex={0}
            onPointerMove={onMove}
            onPointerLeave={clear}
            onKeyDown={onKey}
            onBlur={clear}
            className="block touch-pan-y rounded outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
          >
            <title id={`${id}-cap`}>{caption}</title>
            <desc id={`${id}-desc`}>
              {series.map((s) => `${s.label}: ${fmt(val(days[lastIdx], s.key))} today.`).join(' ')} Use the left and right arrow keys to read each day.
            </desc>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD_L} x2={width - PAD_R} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} shapeRendering="crispEdges" />
                <text x={PAD_L - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-gray-500 font-mono text-xs tabular-nums">
                  {t}
                </text>
              </g>
            ))}
            {active !== null && <line x1={cx(active)} x2={cx(active)} y1={PAD_T} y2={baseline} stroke="#9CA3AF" strokeWidth={1} shapeRendering="crispEdges" />}
            {columns.map((s) =>
              days.map((d, i) => {
                const v = val(d, s.key);
                if (v <= 0) return null;
                const x = cx(i) - colW / 2;
                const top = y(v);
                const r = Math.min(4, colW / 2, baseline - top);
                return (
                  <path
                    key={`${s.key}-${d.date}`}
                    className="motion-col-grow"
                    style={{ animationDelay: `${Math.min(240, i * 12)}ms` }}
                    d={`M${x},${baseline} V${top + r} Q${x},${top} ${x + r},${top} H${x + colW - r} Q${x + colW},${top} ${x + colW},${top + r} V${baseline} Z`}
                    fill={s.color}
                    opacity={active === null || active === i ? 1 : 0.55}
                  />
                );
              })
            )}
            {lines.map((s) => (
              <g key={s.key} className="motion-line-in">
                <path d={path(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={cx(lastIdx)} cy={y(val(days[lastIdx], s.key))} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />
                {active !== null && <circle cx={cx(active)} cy={y(val(days[active], s.key))} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />}
              </g>
            ))}
            {days.map((d, i) => {
              const isToday = d.date === today;
              if (!isToday && (days.length - 1 - i) % labelEvery !== 0) return null;
              return (
                <text key={`x-${d.date}`} x={cx(i)} y={baseline + 18} textAnchor="middle" className={`font-mono text-xs tabular-nums ${isToday ? 'fill-gray-900 font-semibold' : 'fill-gray-500'}`}>
                  {dayFmt(d.date, { day: 'numeric' })}
                </text>
              );
            })}
            <rect x={cx(lastIdx) - 8} y={baseline + 24} width={16} height={2} rx={1} fill={TEAL_DARK} />
          </svg>
        )}
      </div>
      <TableTwin
        caption={caption}
        head={['Day', ...series.map((s) => s.label)]}
        rows={days.map((d) => [dayFmt(d.date, { weekday: 'short', month: 'short', day: 'numeric' }), ...series.map((s) => val(d, s.key))])}
      />
      {tip.node}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ranked bars: one series, Chart Teal, value at the right. Rows may link to the list they count.
// ---------------------------------------------------------------------------

export type BarRow = { label: string; value: number; href?: string; note?: ReactNode; attention?: boolean };

export function RankedBars({ rows, caption, valueHead, empty }: { rows: BarRow[]; caption: string; valueHead: string; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((n, r) => n + r.value, 0);
  if (total === 0) return <p className="px-5 py-10 text-center text-sm text-gray-500">{empty}</p>;
  return (
    <>
      <ul className="space-y-1 px-3 py-3" aria-label={caption}>
        {rows.map((r, i) => {
          const body = (
            <>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-gray-700">{r.label}</span>
                <span className="shrink-0 font-mono font-semibold tabular-nums text-gray-900">{r.value}</span>
              </div>
              <div className="mt-1.5 h-2 rounded-r bg-gray-100">
                {r.value > 0 && (
                  <div
                    className="motion-bar-grow h-full rounded-r"
                    style={{ width: `${(r.value / max) * 100}%`, background: r.attention ? AMBER : SERIES.teal, animationDelay: `${Math.min(240, i * 50)}ms` }}
                  />
                )}
              </div>
              {r.note && <p className="mt-1 text-xs text-gray-500">{r.note}</p>}
            </>
          );
          return (
            <li key={r.label}>
              {r.href ? (
                <Link href={r.href} className="block rounded-md px-2 py-2 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal">
                  {body}
                </Link>
              ) : (
                <div className="px-2 py-2">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      <TableTwin caption={caption} head={['', valueHead]} rows={rows.map((r) => [r.label, r.value])} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Turnaround: share released within target per section, as a meter with a target tick
// ---------------------------------------------------------------------------

export type TatRow = { section: string; released: number; onTime: number; medianHours: number | null };

/** Below this share on time, the bar turns amber and the words say so. */
export const ON_TIME_GOAL = 0.9;

export function hoursText(h: number | null): string {
  if (h === null) return '—';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')} min`;
  return `${Math.round(h / 24)} d`;
}

export function TatBars({ rows, caption }: { rows: TatRow[]; caption: string }) {
  const tip = useTooltip();
  if (rows.length === 0) return <p className="px-5 py-10 text-center text-sm text-gray-500">No reports released in the last 30 days.</p>;
  return (
    <>
      <ul className="divide-y divide-gray-100" aria-label={caption}>
        {rows.map((r, i) => {
          const share = r.onTime / r.released;
          const pct = Math.round(share * 100);
          const low = share < ON_TIME_GOAL;
          const content = (
            <div>
              <p className="mb-1 text-xs font-medium text-gray-500">{r.section}</p>
              <TipRow color={low ? AMBER : SERIES.teal} kind="bar" label="On time" value={`${r.onTime} of ${r.released}`} />
              <TipRow color="#6B7280" kind="line" label="Median" value={hoursText(r.medianHours)} />
            </div>
          );
          return (
            <li key={r.section} className="px-5 py-3">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium text-gray-900">{r.section}</span>
                <span className={`shrink-0 font-mono font-semibold tabular-nums ${low ? 'text-amber-800' : 'text-gray-900'}`}>{pct}% on time</span>
              </div>
              <div
                className="relative mt-2 h-2 rounded-r bg-gray-100"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                aria-valuetext={`${pct}% on time, ${r.onTime} of ${r.released}`}
                aria-label={`${r.section} on time`}
                tabIndex={0}
                onPointerEnter={(e) => tip.showFor(e.currentTarget, content)}
                onPointerLeave={tip.hide}
                onFocus={(e) => tip.showFor(e.currentTarget, content)}
                onBlur={tip.hide}
              >
                <div className="motion-bar-grow h-full rounded-r" style={{ width: `${pct}%`, background: low ? AMBER : SERIES.teal, animationDelay: `${Math.min(240, i * 50)}ms` }} />
                <span aria-hidden="true" className="absolute -top-1 h-4 w-0.5 rounded-full bg-gray-500" style={{ left: `calc(${ON_TIME_GOAL * 100}% - 1px)` }} />
              </div>
              <p className="mt-1.5 text-xs text-gray-500">
                <span className="font-mono tabular-nums">{r.released}</span> released · median <span className="font-mono tabular-nums">{hoursText(r.medianHours)}</span> from collection
                {low && <span className="font-semibold text-amber-800"> · below the {Math.round(ON_TIME_GOAL * 100)}% goal</span>}
              </p>
            </li>
          );
        })}
      </ul>
      <TableTwin caption={caption} head={['Section', 'Released', 'On time', 'Median']} rows={rows.map((r) => [r.section, r.released, `${Math.round((r.onTime / r.released) * 100)}%`, hoursText(r.medianHours)])} />
      {tip.node}
    </>
  );
}
