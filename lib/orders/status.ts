// Order statuses and the only transitions allowed between them (docs/PLAN.md §6).
// Every status change in the app goes through canTransition / assertTransition.

export const ORDER_STATUSES = [
  'received',
  'accepted',
  'rejected',
  'collected',
  'in-progress',
  'awaiting-validation',
  'released',
  'delivered',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  received: ['accepted', 'rejected'],
  accepted: ['collected', 'rejected'],
  rejected: [],
  collected: ['in-progress', 'accepted'], // back to accepted when the specimen is rejected for recollection
  'in-progress': ['awaiting-validation', 'accepted'],
  'awaiting-validation': ['released', 'in-progress'], // a signatory can send results back for correction
  released: ['delivered', 'awaiting-validation'], // amendment
  delivered: ['awaiting-validation'], // amendment
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class TransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus
  ) {
    super(`An order that is ${STATUS_DISPLAY[from].label.toLowerCase()} can't be moved to ${STATUS_DISPLAY[to].label.toLowerCase()}.`);
    this.name = 'TransitionError';
  }
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) throw new TransitionError(from, to);
}

export function nextStatuses(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

/** Badge treatment per status, from the design system's meaning map (BUILD_PROMPT.md "Lab-specific mappings"). */
export const STATUS_DISPLAY: Record<OrderStatus, { label: string; tone: 'teal' | 'amber' | 'emerald' | 'red' }> = {
  received: { label: 'Received', tone: 'teal' },
  accepted: { label: 'Accepted', tone: 'teal' },
  rejected: { label: 'Rejected', tone: 'red' },
  collected: { label: 'Collected', tone: 'amber' },
  'in-progress': { label: 'In progress', tone: 'amber' },
  'awaiting-validation': { label: 'Awaiting validation', tone: 'amber' },
  released: { label: 'Released', tone: 'emerald' },
  delivered: { label: 'Delivered', tone: 'emerald' },
};

export const URGENCIES = ['stat', 'urgent', 'routine'] as const;
export type Urgency = (typeof URGENCIES)[number];

/** Sort key: stat first, then urgent, then routine. */
export function urgencyRank(u: Urgency): number {
  return URGENCIES.indexOf(u);
}

/** Why an order is rejected (FR-3). "Other" needs details. */
export const REJECT_REASONS = [
  'Test not offered',
  'Patient details missing or wrong',
  'Duplicate order',
  'Clinic asked to cancel',
  'Other',
] as const;
