import { describe, expect, it } from 'vitest';
import { setupTestDb } from '../helpers/db';
import { CBC_NORMAL, setupLab } from '../helpers/flow';
import { makeUser } from '../helpers/factories';
import { toSessionUser } from '@/lib/auth/session-store';
import { desktopSummary } from '@/lib/desktop-summary';
import { receiveOrder } from '@/lib/orders/intake';
import { recordCriticalCall, saveResult } from '@/lib/results';
import { manilaInputValue } from '@/lib/specimen-options';

setupTestDb();

describe('desktop summary', () => {
  it('gives each person the items their roles act on, with stable ids', async () => {
    const lab = await setupLab();
    const order = (code: string, urgency: string) =>
      receiveOrder({
        authorization: `Bearer ${lab.clinic.apiKey}`,
        rawBody: JSON.stringify({ request: { requestCode: code, patient: { firstName: 'Ana', lastName: 'Reyes' }, test: { type: 'CBC', urgency } } }),
      });
    await order('LR-A', 'stat');
    await order('LR-B', 'routine');
    const critical = await lab.collectedOrder();
    await saveResult(lab.medtech, critical.orderId, { values: { ...CBC_NORMAL, hb: '5.1' }, submit: true });

    const signatory = await desktopSummary(lab.path2);
    expect(signatory.counts).toMatchObject({ newOrders: 2, statOrders: 1, toValidate: 1, criticalCalls: 1 });
    expect(signatory.items.find((i) => i.title.startsWith('STAT'))).toMatchObject({ kind: 'order', priority: 'urgent', title: 'STAT order: Complete blood count' });
    expect(signatory.items.at(-1)).toMatchObject({ kind: 'order', priority: 'normal' }); // urgent first
    expect(signatory.items.find((i) => i.kind === 'critical')).toMatchObject({ priority: 'urgent', path: `/results/${critical.orderId}` });
    expect((await desktopSummary(lab.path2)).items.map((i) => i.id)).toEqual(signatory.items.map((i) => i.id));

    const { user } = await makeUser(lab.labId, { email: 'phleb@lab.test', roles: ['phlebotomist'] });
    const phleb = await desktopSummary(toSessionUser(user));
    expect(phleb.items).toEqual([]);
    expect(phleb.badge).toBe(0);

    await recordCriticalCall(lab.medtech, critical.orderId, { takenBy: 'Nurse Joy', at: manilaInputValue() });
    const after = await desktopSummary(lab.path2);
    expect(after.counts.criticalCalls).toBe(0);
    expect(after.items.find((i) => i.kind === 'validation')).toBeTruthy();
  });
});
