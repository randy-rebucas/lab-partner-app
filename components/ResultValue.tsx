// A result value with its flag. The flag letter is always shown, so colour is never the only signal:
// H / L in amber-800, C (critical) in red-700 semibold.
export type ResultFlag = 'normal' | 'high' | 'low' | 'critical-high' | 'critical-low';

const FLAG_TEXT: Record<Exclude<ResultFlag, 'normal'>, { letter: string; label: string; cls: string }> = {
  high: { letter: 'H', label: 'High', cls: 'text-amber-800' },
  low: { letter: 'L', label: 'Low', cls: 'text-amber-800' },
  'critical-high': { letter: 'C', label: 'Critical high', cls: 'text-red-700 font-semibold' },
  'critical-low': { letter: 'C', label: 'Critical low', cls: 'text-red-700 font-semibold' },
};

export function isCritical(flag: ResultFlag): boolean {
  return flag === 'critical-high' || flag === 'critical-low';
}

export function ResultValue({ value, unit, flag = 'normal' }: { value: string | number; unit?: string; flag?: ResultFlag }) {
  const f = flag === 'normal' ? null : FLAG_TEXT[flag];
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={`font-mono tabular-nums ${f ? f.cls : 'text-gray-900'}`}>{value}</span>
      {unit && <span className="text-xs text-gray-500">{unit}</span>}
      {f && (
        <abbr title={f.label} className={`font-mono text-xs no-underline ${f.cls}`} aria-label={f.label}>
          {f.letter}
        </abbr>
      )}
    </span>
  );
}
