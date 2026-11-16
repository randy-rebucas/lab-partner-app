import { describe, expect, it } from 'vitest';
import { setupTestDb } from '../helpers/db';
import { makeLab, makeUser } from '../helpers/factories';
import { toSessionUser } from '@/lib/auth/session-store';
import { createClinic, setClinicActive } from '@/lib/clinics';
import { addCommonNames } from '@/lib/catalog/mappings';
import { addSampleTests, setTestActive } from '@/lib/catalog/tests';
import { RATE_LIMIT_PER_MINUTE, receiveOrder, sexFrom, validBirthDate } from '@/lib/orders/intake';
import { IntakeRefusal } from '@/models/IntakeRefusal';
import { Order } from '@/models/Order';
import { TestDefinition } from '@/models/TestDefinition';

setupTestDb();

async function setup() {
  const lab = await makeLab();
  const { user } = await makeUser(lab._id, { email: 'admin@lab.test', roles: ['admin'] });
  const actor = toSessionUser(user);
  await addSampleTests(String(lab._id), actor);
  const clinic = await createClinic(actor, { name: 'Reyes Family Clinic', mcsLabCode: 'sample-lab', platformHost: 'https://reyes.test' });
  if (!clinic.ok) throw new Error('setup failed');
  await addCommonNames(actor, clinic.clinicId);
  return { actor, clinicId: clinic.clinicId, auth: `Bearer ${clinic.apiKey}` };
}

/** The body exactly as MyClinicSoft sends it (lib/lab-integration.ts there). */
function order(over: Record<string, unknown> = {}, patient: Record<string, unknown> = {}, test: Record<string, unknown> = {}) {
  return JSON.stringify({
    request: {
      requestCode: 'LR-000481',
      patient: { firstName: 'Ana', lastName: 'Reyes', dateOfBirth: '2019-04-02', gender: 'female', patientCode: 'P-01234', ...patient },
      test: { type: 'CBC', code: undefined, urgency: 'routine', ...test },
      clinicalInfo: { diagnosis: 'Fever, unspecified', chiefComplaint: 'Fever for 3 days' },
      instructions: 'Fasting not required',
      ...over,
    },
  });
}

describe('order intake', () => {
  it('stores a new order and answers 201 with requestId', async () => {
    const { auth } = await setup();
    const r = await receiveOrder({ authorization: auth, rawBody: order() });
    expect(r.status).toBe(201);
    const body = r.body as { requestId: string; status: string };
    expect(body).toEqual({ requestId: expect.stringMatching(/^ord_/), status: 'received' });
    const o = await Order.findOne({ requestId: body.requestId }).lean();
    expect(o).toMatchObject({
      requestCode: 'LR-000481',
      urgency: 'routine',
      status: 'received',
      patient: { firstName: 'Ana', lastName: 'Reyes', dateOfBirth: '2019-04-02', sex: 'female', patientCode: 'P-01234' },
      test: { type: 'CBC', labCode: 'CBC', labName: 'Complete blood count' },
      clinicalInfo: { diagnosis: 'Fever, unspecified' },
      instructions: 'Fasting not required',
    });
    expect(o?.statusHistory).toHaveLength(1);
    expect(o?.statusHistory[0]).toMatchObject({ status: 'received', by: 'Reyes Family Clinic' });
  });

  it('answers a repeat with 200 and the same requestId, never a second order', async () => {
    const { auth } = await setup();
    const first = await receiveOrder({ authorization: auth, rawBody: order() });
    const again = await receiveOrder({ authorization: auth, rawBody: order({}, { firstName: 'Changed' }) });
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect(await Order.countDocuments()).toBe(1);
  });

  it('answers two copies sent at once with one order', async () => {
    const { auth } = await setup();
    const replies = await Promise.all([1, 2, 3].map(() => receiveOrder({ authorization: auth, rawBody: order() })));
    expect(replies.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    expect(new Set(replies.map((r) => (r.body as { requestId: string }).requestId)).size).toBe(1);
    expect(await Order.countDocuments()).toBe(1);
  });

  it('refuses a missing, wrong or switched-off key', async () => {
    const { actor, clinicId, auth } = await setup();
    expect((await receiveOrder({ authorization: null, rawBody: order() })).status).toBe(401);
    expect((await receiveOrder({ authorization: 'Bearer lpk_abcdefgh_wrongwrongwrongwrongwrong', rawBody: order() })).status).toBe(401);
    expect((await receiveOrder({ authorization: auth.replace('Bearer ', 'Basic '), rawBody: order() })).status).toBe(401);
    await setClinicActive(actor, clinicId, false);
    const off = await receiveOrder({ authorization: auth, rawBody: order() });
    expect(off).toMatchObject({ status: 403, body: { error: { code: 'CLINIC_INACTIVE' } } });
  });

  it('refuses an unknown test with 422 UNKNOWN_TEST and notes the name for the lab, without patient details', async () => {
    const { auth } = await setup();
    const r = await receiveOrder({ authorization: auth, rawBody: order({}, {}, { type: 'Thyroid panel', code: 'TSH-1' }) });
    expect(r).toMatchObject({ status: 422, body: { error: { code: 'UNKNOWN_TEST' } } });
    await receiveOrder({ authorization: auth, rawBody: order({ requestCode: 'LR-2' }, {}, { type: 'thyroid  PANEL', code: 'tsh-1' }) });
    const seen = await IntakeRefusal.find().lean();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ testType: 'thyroid  PANEL', count: 2, reason: 'unmapped', lastRequestCode: 'LR-2' });
    expect(JSON.stringify(seen)).not.toContain('Reyes');
  });

  it('clears a refused name once the lab adds it, and the next order is accepted', async () => {
    const { actor, clinicId, auth } = await setup();
    await receiveOrder({ authorization: auth, rawBody: order({}, {}, { type: 'Thyroid panel', code: 'TSH-1' }) });
    await receiveOrder({ authorization: auth, rawBody: order({ requestCode: 'LR-2' }, {}, { type: 'Other name', code: 'X-9' }) });
    const cbc = await TestDefinition.findOne({ code: 'CBC' }).lean();
    const { addMapping } = await import('@/lib/catalog/mappings');
    await addMapping(actor, clinicId, { clinicTestType: 'THYROID-panel', testId: String(cbc!._id) });
    expect((await IntakeRefusal.find().lean()).map((r) => r.testType)).toEqual(['Other name']);
    await addMapping(actor, clinicId, { clinicTestCode: 'x-9', testId: String(cbc!._id) });
    expect(await IntakeRefusal.countDocuments()).toBe(0);
    expect((await receiveOrder({ authorization: auth, rawBody: order({ requestCode: 'LR-3' }, {}, { type: 'Thyroid panel' }) })).status).toBe(201);
  });

  it('refuses a test the lab switched off', async () => {
    const { actor, auth } = await setup();
    const cbc = await TestDefinition.findOne({ code: 'CBC' }).lean();
    await setTestActive(actor, String(cbc!._id), false);
    const r = await receiveOrder({ authorization: auth, rawBody: order() });
    expect(r).toMatchObject({ status: 422, body: { error: { code: 'UNKNOWN_TEST', message: expect.stringMatching(/isn’t taking orders/) } } });
  });

  it('refuses a patient without a name or with an impossible birth date', async () => {
    const { auth } = await setup();
    for (const patient of [{ firstName: '' }, { lastName: '  ' }, { dateOfBirth: '2019-02-30' }, { dateOfBirth: '04/02/2019' }, { dateOfBirth: '2999-01-01' }]) {
      const r = await receiveOrder({ authorization: auth, rawBody: order({}, patient) });
      expect(r, JSON.stringify(patient)).toMatchObject({ status: 422, body: { error: { code: 'INVALID_PATIENT' } } });
    }
    expect(await Order.countDocuments()).toBe(0);
  });

  it('accepts what MyClinicSoft may leave out, and keeps extra fields', async () => {
    const { auth } = await setup();
    const r = await receiveOrder({
      authorization: auth,
      rawBody: JSON.stringify({
        request: {
          requestCode: 'LR-9',
          patient: { firstName: 'Ben', lastName: 'Cruz', dateOfBirth: '' },
          test: { type: 'Urinalysis', urgency: 'STAT' },
          orderCode: 'LO-77',
          orderingDoctor: { name: 'Dr. Santos' },
        },
      }),
    });
    expect(r.status).toBe(201);
    const o = await Order.findOne({ requestCode: 'LR-9' }).lean();
    expect(o?.urgency).toBe('stat');
    expect(o?.patient?.dateOfBirth).toBeUndefined();
    expect(o?.patient?.sex).toBeUndefined();
    expect(o?.extras).toEqual({ orderCode: 'LO-77', orderingDoctor: { name: 'Dr. Santos' } });
  });

  it('says what is wrong with a malformed body', async () => {
    const { auth } = await setup();
    expect(await receiveOrder({ authorization: auth, rawBody: '{nope' })).toMatchObject({ status: 400, body: { error: { code: 'INVALID_REQUEST' } } });
    expect(await receiveOrder({ authorization: auth, rawBody: '{"request":{"patient":{},"test":{}}}' })).toMatchObject({
      status: 400,
      body: { error: { message: expect.stringMatching(/requestCode/) } },
    });
  });

  it(`limits a clinic to ${RATE_LIMIT_PER_MINUTE} requests a minute`, async () => {
    const { auth } = await setup();
    const now = new Date('2026-11-16T01:00:10Z');
    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) {
      const r = await receiveOrder({ authorization: auth, rawBody: '{}', now });
      expect(r.status).toBe(400);
    }
    const over = await receiveOrder({ authorization: auth, rawBody: order(), now });
    expect(over).toMatchObject({ status: 429, body: { error: { code: 'RATE_LIMITED' } }, headers: { 'Retry-After': '50' } });
    const nextMinute = await receiveOrder({ authorization: auth, rawBody: order(), now: new Date('2026-11-16T01:01:00Z') });
    expect(nextMinute.status).toBe(201);
  });
});

describe('intake helpers', () => {
  it('reads sex from what clinics send', () => {
    expect(sexFrom('Female')).toEqual({ sex: 'female' });
    expect(sexFrom('M')).toEqual({ sex: 'male' });
    expect(sexFrom('other')).toEqual({ genderText: 'other' });
    expect(sexFrom(undefined)).toEqual({});
  });
  it('accepts only real past dates', () => {
    const now = new Date('2026-11-16T00:00:00Z');
    expect(validBirthDate('2024-02-29', now)).toBe(true);
    expect(validBirthDate('2023-02-29', now)).toBe(false);
    expect(validBirthDate('2026-11-17', now)).toBe(false);
    expect(validBirthDate('1899-12-31', now)).toBe(false);
  });
});
