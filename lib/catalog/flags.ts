// Reference ranges and flags (PLAN.md §6 "Flagging"). Pure functions, shared by result entry,
// validation, the report and the results webhook.

export type Sex = 'male' | 'female';
export type RangeBand = {
  sex?: 'any' | 'male' | 'female' | null;
  ageMinDays?: number | null;
  ageMaxDays?: number | null;
  low?: number | null;
  high?: number | null;
  text?: string | null;
};
export type AnalyteLimits = {
  unit?: string | null;
  kind?: 'number' | 'text' | null;
  ranges: RangeBand[];
  criticalLow?: number | null;
  criticalHigh?: number | null;
};

/** H/L outside the reference range, C beyond a critical limit. */
export type Flag = 'H' | 'L' | 'C';
export type FlagResult = { flag: Flag | null; direction: 'high' | 'low' | null };

const has = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);

function inAgeBand(r: RangeBand, ageDays: number | undefined): boolean {
  if (!has(r.ageMinDays) && !has(r.ageMaxDays)) return true;
  if (ageDays === undefined) return false;
  if (has(r.ageMinDays) && ageDays < r.ageMinDays) return false;
  if (has(r.ageMaxDays) && ageDays >= r.ageMaxDays) return false;
  return true;
}

/**
 * The band for this patient: one for their sex beats one for any sex; within those, an age band
 * beats an open one. With no age known, only bands without age limits apply.
 */
export function pickRange(ranges: RangeBand[], sex: Sex | undefined, ageDays: number | undefined): RangeBand | null {
  const fits = ranges.filter((r) => inAgeBand(r, ageDays) && (!r.sex || r.sex === 'any' || r.sex === sex));
  const score = (r: RangeBand) => (r.sex && r.sex !== 'any' ? 2 : 0) + (has(r.ageMinDays) || has(r.ageMaxDays) ? 1 : 0);
  return fits.sort((a, b) => score(b) - score(a))[0] ?? null;
}

/** Age in whole days on a date (collection time), from a YYYY-MM-DD date of birth. */
export function ageInDays(dateOfBirth: string | Date | null | undefined, on: Date): number | undefined {
  if (!dateOfBirth) return undefined;
  const dob = typeof dateOfBirth === 'string' ? new Date(`${dateOfBirth.slice(0, 10)}T00:00:00Z`) : dateOfBirth;
  if (Number.isNaN(dob.getTime())) return undefined;
  const days = Math.floor((on.getTime() - dob.getTime()) / 86_400_000);
  return days >= 0 ? days : undefined;
}

/** A typed value as a number: "5.1", " 5,100 " → 5100. Text values give null. */
export function numericValue(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (!raw) return null;
  const cleaned = raw.trim().replace(/,/g, '');
  if (!/^[-+]?\d*\.?\d+$/.test(cleaned)) return null;
  return Number(cleaned);
}

export function flagValue(
  analyte: AnalyteLimits,
  raw: string | number | null | undefined,
  sex: Sex | undefined,
  ageDays: number | undefined
): FlagResult {
  const none: FlagResult = { flag: null, direction: null };
  if (analyte.kind === 'text') return none;
  const v = numericValue(raw);
  if (v === null) return none;
  if (has(analyte.criticalLow) && v < analyte.criticalLow) return { flag: 'C', direction: 'low' };
  if (has(analyte.criticalHigh) && v > analyte.criticalHigh) return { flag: 'C', direction: 'high' };
  const band = pickRange(analyte.ranges, sex, ageDays);
  if (!band) return none;
  if (has(band.low) && v < band.low) return { flag: 'L', direction: 'low' };
  if (has(band.high) && v > band.high) return { flag: 'H', direction: 'high' };
  return none;
}

/** The range as printed and as sent in `referenceRanges`: "12-16 g/dL", "<200 mg/dL", "Negative". */
export function formatRange(band: RangeBand | null, unit?: string | null): string {
  if (!band) return '';
  const u = unit ? ` ${unit}` : '';
  if (has(band.low) && has(band.high)) return `${band.low}-${band.high}${u}`;
  if (has(band.high)) return `<${band.high}${u}`;
  if (has(band.low)) return `>${band.low}${u}`;
  return band.text ?? '';
}

/** "Male, 1–12 years" style label for a band in the editor and on reports. */
export function describeBand(band: RangeBand): string {
  const who = band.sex === 'male' ? 'Male' : band.sex === 'female' ? 'Female' : 'Anyone';
  if (!has(band.ageMinDays) && !has(band.ageMaxDays)) return who;
  const from = has(band.ageMinDays) ? formatAge(band.ageMinDays) : '0';
  const to = has(band.ageMaxDays) ? `under ${formatAge(band.ageMaxDays)}` : 'and over';
  return `${who}, ${from} ${to}`;
}

/** Days as the coarsest exact unit: 365 → "1 y", 30 → "1 mo", 3 → "3 d". */
export function formatAge(days: number): string {
  if (days === 0) return '0';
  if (days % 365 === 0) return `${days / 365} y`;
  if (days % 30 === 0) return `${days / 30} mo`;
  return `${days} d`;
}

export const AGE_UNITS = { d: 1, mo: 30, y: 365 } as const;
export type AgeUnit = keyof typeof AGE_UNITS;

/** Split days into the editor's number + unit. */
export function splitAge(days: number | null | undefined): { n: string; unit: AgeUnit } {
  if (!has(days)) return { n: '', unit: 'y' };
  if (days % 365 === 0) return { n: String(days / 365), unit: 'y' };
  if (days % 30 === 0) return { n: String(days / 30), unit: 'mo' };
  return { n: String(days), unit: 'd' };
}
