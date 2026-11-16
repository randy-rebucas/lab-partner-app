// Turnaround against each test's target (FR-9): from collection to release.

export type TatState = 'on-time' | 'overdue' | 'very-overdue';

/** Past the target is overdue; past twice the target is very overdue (BUILD_PROMPT "Overdue"). */
export function tatState(collectedAt: Date | string, targetHours: number, now = new Date()): TatState {
  const elapsed = now.getTime() - new Date(collectedAt).getTime();
  const target = targetHours * 3_600_000;
  if (elapsed > 2 * target) return 'very-overdue';
  if (elapsed > target) return 'overdue';
  return 'on-time';
}

export const sectionSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
