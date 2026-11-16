// Choices for check-in and collection; shared by the forms and the server rules.

/** IDs commonly shown at Philippine lab counters. A child is checked with a guardian's ID or a birth certificate. */
export const ID_TYPES = [
  'PhilSys national ID',
  'Driver’s licence',
  'Passport',
  'UMID or SSS ID',
  'PhilHealth ID',
  'Senior citizen ID',
  'PWD ID',
  'Postal ID',
  'Voter’s ID',
  'School ID',
  'Birth certificate (child)',
  'Guardian’s ID (child)',
  'Other ID',
] as const;

/** The usual container for each catalog specimen type. */
export const CONTAINER_FOR: Record<string, string> = {
  'Whole blood (EDTA)': 'Lavender top (EDTA)',
  Serum: 'Red or gold top (serum)',
  'Plasma (fluoride)': 'Gray top (fluoride)',
  'Plasma (citrate)': 'Light blue top (citrate)',
  Urine: 'Urine cup',
  Stool: 'Stool container',
  Swab: 'Swab tube',
};

export const CONTAINERS = [...new Set([...Object.values(CONTAINER_FOR), 'Other container'])];

/** Now in Manila as a datetime-local value: "2026-11-16T09:41". */
export function manilaInputValue(d = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** A datetime-local value read as Manila time (UTC+8, no daylight saving). */
export function manilaInputToDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(`${value}:00+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const SPECIMEN_CONDITIONS = ['Good', 'Hemolysed', 'Lipemic', 'Icteric', 'Clotted', 'Insufficient volume'] as const;

export const SPECIMEN_REJECT_REASONS = [
  'Hemolysed',
  'Clotted',
  'Insufficient volume',
  'Wrong container',
  'Unlabelled or mislabelled',
  'Leaked or broken',
  'Too old to test',
  'Other',
] as const;
