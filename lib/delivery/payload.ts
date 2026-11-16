import { numericValue } from '@/lib/catalog/flags';

// The results webhook body (contract §2), built once at release and frozen on the Delivery row.

type Value = { key: string; name: string; unit?: string | null; kind?: string | null; value: string; flag?: string | null; direction?: string | null; range?: string | null };

/** "2026-11-16T09:30:00+08:00": the release time in Manila. */
export function manilaIso(d: Date): string {
  const m = new Date(d.getTime() + 8 * 3_600_000);
  return `${m.toISOString().slice(0, 19)}+08:00`;
}

export function buildPayload(input: {
  requestId: string;
  requestCode: string;
  resultIdString: string;
  testType: string;
  values: Value[];
  interpretation?: string | null;
  amendReason?: string | null;
  releasedAt: Date;
  labName: string;
}) {
  const filled = input.values.filter((v) => v.value.trim() !== '');
  const results: Record<string, number | string> = {};
  const referenceRanges: Record<string, string> = {};
  const abnormalFlags: Record<string, 'high' | 'low' | 'normal'> = {};
  const critical: string[] = [];
  for (const v of filled) {
    const n = v.kind === 'text' ? null : numericValue(v.value);
    results[v.key] = n ?? v.value.trim();
    if (v.range) referenceRanges[v.key] = v.range;
    // Only high, low or normal on the wire; a critical value goes as its direction and is named below.
    abnormalFlags[v.key] = v.direction === 'high' ? 'high' : v.direction === 'low' ? 'low' : 'normal';
    if (v.flag === 'C') critical.push(`${v.key} ${v.value.trim()}${v.unit ? ` ${v.unit}` : ''}`);
  }
  const notes = [
    input.amendReason ? `Corrected result: ${input.amendReason}` : null,
    critical.length ? `Critical: ${critical.join(', ')}` : null,
    input.interpretation?.trim() || null,
  ].filter(Boolean);
  return {
    requestId: input.requestId,
    requestCode: input.requestCode,
    resultId: input.resultIdString,
    testType: input.testType,
    results,
    referenceRanges,
    abnormalFlags,
    interpretation: notes.join('\n') || 'See values',
    resultDate: manilaIso(input.releasedAt),
    labName: input.labName,
  };
}
