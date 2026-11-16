import { describe, expect, it } from 'vitest';
import { setupTestDb } from '../helpers/db';
import { makeLab, makeUser } from '../helpers/factories';
import { toSessionUser } from '@/lib/auth/session-store';
import { addCommonNames } from '@/lib/catalog/mappings';
import { addSampleTests } from '@/lib/catalog/tests';
import { createClinic } from '@/lib/clinics';
import { inbox, inboxCounts } from '@/lib/orders/inbox';
import { receiveOrder } from '@/lib/orders/intake';
import { acceptOrder, rejectOrder } from '@/lib/orders/transition';
import { AuditEvent } from '@/models/AuditEvent';
import { Order } from '@/models/Order';

setupTestDb();

async function setup() {
  const lab = await makeLab();
  const { user } = await makeUser(lab._id, { email: 'desk@lab.test', roles: ['front-desk'] });
  const actor = toSessionUser(user);
  await addSampleTests(String(lab._id), actor);
  const clinics: { apiKey: string }[] = [];
  for (const name of ['Reyes Family Clinic', 'Abad Pediatrics']) {
    const c = await createClinic(actor, { name, mcsLabCode: 'sample-lab', platformHost: 'https://x.test' });
    if (!c.ok) throw new Error('setup');
    await addCommonNames(actor, c.clinicId);
    clinics.push(c);
  }
  let n = 0;
  const send = async (clinic: number, urgency: string, lastName: string, minutesAgo: number) => {
    n += 1;
    const r = await receiveOrder({
      authorization: `Bearer ${clinics[clinic].apiKey}`,
      now: new Date(Date.now() - minutesAgo * 60_000),
      rawBody: JSON.stringify({
        request: { requestCode: `LR-${n}`, patient: { firstName: 'Test', lastName, dateOfBirth: '1990-01-01' }, test: { type: 'CBC', urgency } },
      }),
    });
    return (r.body as { requestId: string }).requestId;
  };
  return { actor, send };
}

describe('inbox', () => {
  it('groups by clinic; STAT then urgent then routine; oldest first within each', async () => {
    const { actor, send } = await setup();
    await send(0, 'routine', 'Old', 50);
    await send(0, 'urgent', 'Urgent', 10);
    await send(0, 'routine', 'Newer', 5);
    await send(1, 'routine', 'Abad', 40);
    await send(1, 'stat', 'Stat', 1);
    const { groups } = await inbox(actor.labId, 'new');
    expect(groups.map((g) => g.clinicName)).toEqual(['Abad Pediatrics', 'Reyes Family Clinic']);
    expect(groups[0].rows.map((r) => r.patientName)).toEqual(['Stat, Test', 'Abad, Test']);
    expect(groups[1].rows.map((r) => r.patientName)).toEqual(['Urgent, Test', 'Old, Test', 'Newer, Test']);
  });

  it('searches by name or request code, and counts each view', async () => {
    const { actor, send } = await setup();
    await send(0, 'routine', 'Reyes', 5);
    await send(0, 'routine', 'Cruz', 5);
    expect((await inbox(actor.labId, 'new', 'reyes')).total).toBe(1);
    expect((await inbox(actor.labId, 'new', 'LR-2')).total).toBe(1);
    expect((await inbox(actor.labId, 'new', 'test cruz')).total).toBe(1);
    expect((await inbox(actor.labId, 'new', '.*')).total).toBe(0);
    expect(await inboxCounts(actor.labId)).toMatchObject({ new: 2, accepted: 0, rejected: 0 });
  });
});

describe('accept and reject', () => {
  it('accepts once; a second accept is refused with the current status', async () => {
    const { actor, send } = await setup();
    const requestId = await send(0, 'routine', 'Reyes', 5);
    const o = await Order.findOne({ requestId }).lean();
    expect((await acceptOrder(actor, String(o!._id))).ok).toBe(true);
    const again = await acceptOrder(actor, String(o!._id));
    expect(!again.ok && again.error).toMatch(/already accepted/);
    const after = await Order.findById(o!._id).lean();
    expect(after?.statusHistory.map((h) => h.status)).toEqual(['received', 'accepted']);
    expect(after?.statusHistory[1]).toMatchObject({ by: 'Maria Santos' });
    expect(await AuditEvent.countDocuments({ action: 'order.accepted' })).toBe(1);
  });

  it('two people accepting at once: one wins', async () => {
    const { actor, send } = await setup();
    const o = await Order.findOne({ requestId: await send(0, 'routine', 'Reyes', 5) }).lean();
    const results = await Promise.all([acceptOrder(actor, String(o!._id)), acceptOrder(actor, String(o!._id))]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await Order.findById(o!._id).lean())?.statusHistory).toHaveLength(2);
  });

  it('rejects with a reason; Other needs details; a rejected order stays closed', async () => {
    const { actor, send } = await setup();
    const id = String((await Order.findOne({ requestId: await send(0, 'routine', 'Reyes', 5) }).lean())!._id);
    expect(await rejectOrder(actor, id, '', '')).toMatchObject({ ok: false, fieldErrors: { reason: expect.any(String) } });
    expect(await rejectOrder(actor, id, 'Other', ' ')).toMatchObject({ ok: false, fieldErrors: { detail: expect.any(String) } });
    expect((await rejectOrder(actor, id, 'Patient details missing or wrong', 'No date of birth')).ok).toBe(true);
    const o = await Order.findById(id).lean();
    expect(o).toMatchObject({ status: 'rejected', rejectReason: 'Patient details missing or wrong: No date of birth' });
    expect((await acceptOrder(actor, id)).ok).toBe(false);
    expect((await inbox(actor.labId, 'rejected')).groups[0].rows[0].rejectReason).toMatch(/No date of birth/);
  });

  it('cannot touch another lab’s order', async () => {
    const { send } = await setup();
    const id = String((await Order.findOne({ requestId: await send(0, 'routine', 'Reyes', 5) }).lean())!._id);
    const otherLab = await makeLab('Other Lab');
    const { user } = await makeUser(otherLab._id, { email: 'x@other.test', roles: ['admin'] });
    expect((await acceptOrder(toSessionUser(user), id)).ok).toBe(false);
  });
});
