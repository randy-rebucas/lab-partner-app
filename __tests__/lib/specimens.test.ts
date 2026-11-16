import { describe, expect, it } from 'vitest';
import { setupTestDb } from '../helpers/db';
import { makeLab, makeUser } from '../helpers/factories';
import { toSessionUser } from '@/lib/auth/session-store';
import { addCommonNames } from '@/lib/catalog/mappings';
import { addSampleTests } from '@/lib/catalog/tests';
import { createClinic } from '@/lib/clinics';
import { receiveOrder } from '@/lib/orders/intake';
import { manilaInputToDate, manilaInputValue } from '@/lib/specimen-options';
import { checkIn, collectSpecimen, findOrderByCode, newAccessionNo, rejectSpecimen } from '@/lib/specimens';
import { Order } from '@/models/Order';
import { Specimen } from '@/models/Specimen';

setupTestDb();

const NOW = new Date('2026-11-16T01:30:00Z'); // 9:30 AM in Manila
const goodId = { idType: 'PhilSys national ID', nameMatches: true, birthDateMatches: true };
const collection = (over: Record<string, string> = {}) => ({ container: 'Lavender top (EDTA)', collectedAt: '2026-11-16T09:25', condition: 'Good', ...over });

async function setup() {
  const lab = await makeLab();
  const { user } = await makeUser(lab._id, { email: 'phleb@lab.test', roles: ['admin'], name: 'Paolo Cruz' });
  const actor = toSessionUser(user);
  await addSampleTests(String(lab._id), actor);
  const c = await createClinic(actor, { name: 'Reyes Family Clinic', mcsLabCode: 'sample-lab', platformHost: 'https://x.test' });
  if (!c.ok) throw new Error('setup');
  await addCommonNames(actor, c.clinicId);
  let n = 0;
  const order = async () => {
    n += 1;
    const r = await receiveOrder({
      authorization: `Bearer ${c.apiKey}`,
      rawBody: JSON.stringify({ request: { requestCode: `LR-${n}`, patient: { firstName: 'Ana', lastName: 'Reyes', dateOfBirth: '2019-04-02' }, test: { type: 'CBC', urgency: 'routine' } } }),
    });
    const o = await Order.findOne({ requestId: (r.body as { requestId: string }).requestId }).lean();
    return String(o!._id);
  };
  return { actor, order, labId: String(lab._id) };
}

describe('accession numbers', () => {
  it('count per Manila day: YYMMDD-NNNN', async () => {
    await setup();
    expect(await newAccessionNo(new Date('2026-11-16T01:00:00Z'))).toBe('261116-0001');
    expect(await newAccessionNo(new Date('2026-11-16T15:59:00Z'))).toBe('261116-0002'); // 11:59 PM Manila
    expect(await newAccessionNo(new Date('2026-11-16T16:00:00Z'))).toBe('261117-0001'); // midnight Manila
  });
  it('reads datetime-local values as Manila time', () => {
    expect(manilaInputToDate('2026-11-16T09:25')?.toISOString()).toBe('2026-11-16T01:25:00.000Z');
    expect(manilaInputValue(new Date('2026-11-16T16:05:00Z'))).toBe('2026-11-17T00:05');
    expect(manilaInputToDate('16/11/2026 9:25')).toBeNull();
  });
});

describe('check-in', () => {
  it('needs the ID type and both matches ticked', async () => {
    const { actor, order } = await setup();
    const id = await order();
    const r = await checkIn(actor, id, { idType: 'Library card', nameMatches: false, birthDateMatches: false });
    expect(r).toMatchObject({ ok: false, fieldErrors: { idType: expect.any(String), nameMatches: expect.any(String), birthDateMatches: expect.any(String) } });
  });

  it('accepts a received order on the way, and records who checked which ID', async () => {
    const { actor, order } = await setup();
    const id = await order();
    expect((await checkIn(actor, id, { ...goodId, note: 'Mother present' })).ok).toBe(true);
    const o = await Order.findById(id).lean();
    expect(o?.status).toBe('accepted');
    expect(o?.checkIn).toMatchObject({ idType: 'PhilSys national ID', by: 'Paolo Cruz', note: 'Mother present' });
    expect(o?.statusHistory.map((h) => h.status)).toEqual(['received', 'accepted']);
  });
});

describe('collection', () => {
  it('can’t collect before the ID check', async () => {
    const { actor, order } = await setup();
    const id = await order();
    expect(await collectSpecimen(actor, id, collection(), NOW)).toMatchObject({ ok: false, error: expect.stringMatching(/isn’t waiting for a specimen/) });
    const { acceptOrder } = await import('@/lib/orders/transition');
    await acceptOrder(actor, id);
    expect(await collectSpecimen(actor, id, collection(), NOW)).toMatchObject({ ok: false, error: 'Check the patient’s ID first.' });
  });

  it('refuses a future or old collection time', async () => {
    const { actor, order } = await setup();
    const id = await order();
    await checkIn(actor, id, goodId);
    expect(await collectSpecimen(actor, id, collection({ collectedAt: '2026-11-16T10:00' }), NOW)).toMatchObject({ fieldErrors: { collectedAt: expect.stringMatching(/future/) } });
    expect(await collectSpecimen(actor, id, collection({ collectedAt: '2026-11-10T10:00' }), NOW)).toMatchObject({ fieldErrors: { collectedAt: expect.stringMatching(/3 days/) } });
  });

  it('collects: accession number, order collected, findable by scan', async () => {
    const { actor, order, labId } = await setup();
    const id = await order();
    await checkIn(actor, id, goodId);
    const r = await collectSpecimen(actor, id, collection(), NOW);
    expect(r).toMatchObject({ ok: true, accessionNo: '261116-0001' });
    const o = await Order.findById(id).lean();
    expect(o).toMatchObject({ status: 'collected', accessionNo: '261116-0001' });
    expect(await findOrderByCode(labId, '261116-0001')).toBe(id);
    expect(await findOrderByCode(labId, 'LR-1')).toBe(id);
    expect(await findOrderByCode(labId, o!.requestId)).toBe(id);
    expect(await findOrderByCode(labId, 'nothing')).toBeNull();
    // A second collection for the same order is refused.
    expect((await collectSpecimen(actor, id, collection(), NOW)).ok).toBe(false);
    expect(await Specimen.countDocuments()).toBe(1);
  });

  it('rejecting a specimen sends the order back; the recollection gets a new number', async () => {
    const { actor, order } = await setup();
    const id = await order();
    await checkIn(actor, id, goodId);
    const first = await collectSpecimen(actor, id, collection(), NOW);
    if (!first.ok) throw new Error('collect');
    expect(await rejectSpecimen(actor, first.specimenId, '', '')).toMatchObject({ fieldErrors: { reason: expect.any(String) } });
    expect((await rejectSpecimen(actor, first.specimenId, 'Hemolysed', '')).ok).toBe(true);
    expect((await rejectSpecimen(actor, first.specimenId, 'Hemolysed', '')).ok).toBe(false);
    expect((await Order.findById(id).lean())?.status).toBe('accepted');

    const second = await collectSpecimen(actor, id, collection({ collectedAt: '2026-11-16T09:29' }), NOW);
    expect(second).toMatchObject({ ok: true, accessionNo: '261116-0002' });
    const s2 = await Specimen.findOne({ accessionNo: '261116-0002' }).lean();
    expect(String(s2?.recollectOf)).toBe(first.specimenId);
    const o = await Order.findById(id).lean();
    expect(o?.statusHistory.map((h) => h.status)).toEqual(['received', 'accepted', 'collected', 'accepted', 'collected']);
    expect(o?.statusHistory[3].note).toMatch(/261116-0001 rejected \(Hemolysed\)/);
  });
});
