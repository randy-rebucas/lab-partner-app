import { describe, expect, it } from 'vitest';
import {
  ORDER_STATUSES,
  STATUS_DISPLAY,
  TransitionError,
  assertTransition,
  canTransition,
  urgencyRank,
  type OrderStatus,
} from '@/lib/orders/status';

const allowed: [OrderStatus, OrderStatus][] = [
  ['received', 'accepted'],
  ['received', 'rejected'],
  ['accepted', 'collected'],
  ['accepted', 'rejected'],
  ['collected', 'in-progress'],
  ['collected', 'accepted'],
  ['in-progress', 'awaiting-validation'],
  ['in-progress', 'accepted'],
  ['awaiting-validation', 'released'],
  ['awaiting-validation', 'in-progress'],
  ['released', 'delivered'],
  ['released', 'awaiting-validation'],
  ['delivered', 'awaiting-validation'],
];

describe('order status transitions', () => {
  it('allows exactly the listed transitions and nothing else', () => {
    const allowedKeys = new Set(allowed.map(([a, b]) => `${a}>${b}`));
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(allowedKeys.has(`${from}>${to}`));
      }
    }
  });

  it('treats rejected as final', () => {
    for (const to of ORDER_STATUSES) expect(canTransition('rejected', to)).toBe(false);
  });

  it('never releases without validation', () => {
    for (const from of ORDER_STATUSES) {
      if (from !== 'awaiting-validation') expect(canTransition(from, 'released')).toBe(false);
    }
  });

  it('throws a readable error for a refused transition', () => {
    expect(() => assertTransition('received', 'released')).toThrow(TransitionError);
    expect(() => assertTransition('received', 'released')).toThrow("An order that is received can't be moved to released.");
    expect(() => assertTransition('received', 'accepted')).not.toThrow();
  });

  it('has a label and badge tone for every status', () => {
    for (const s of ORDER_STATUSES) expect(STATUS_DISPLAY[s].label).toBeTruthy();
  });

  it('ranks stat before urgent before routine', () => {
    expect(urgencyRank('stat')).toBeLessThan(urgencyRank('urgent'));
    expect(urgencyRank('urgent')).toBeLessThan(urgencyRank('routine'));
  });
});
