import { describe, expect, it } from 'vitest';
import { setupTestDb } from '../helpers/db';
import { makeLab, makeUser } from '../helpers/factories';
import { toSessionUser } from '@/lib/auth/session-store';
import { createClinic } from '@/lib/clinics';
import { addCommonNames, addMapping, removeMapping, resolveTest } from '@/lib/catalog/mappings';
import { addSampleTests, createTest, overlappingBands, setTestActive, updateTest, type TestInput } from '@/lib/catalog/tests';
import { TestDefinition } from '@/models/TestDefinition';
import { TestMapping } from '@/models/TestMapping';
import { AuditEvent } from '@/models/AuditEvent';

setupTestDb();

async function setup() {
  const lab = await makeLab();
  const { user } = await makeUser(lab._id, { email: 'admin@lab.test', roles: ['admin'] });
  const actor = toSessionUser(user);
  const clinic = await createClinic(actor, { name: 'Reyes Family Clinic', mcsLabCode: 'sample-lab', platformHost: 'https://reyes.test' });
  if (!clinic.ok) throw new Error('setup failed');
  return { actor, clinicId: clinic.clinicId, labId: String(lab._id) };
}

const esr = (over: Partial<TestInput> = {}): TestInput => ({
  code: 'esr',
  name: 'Erythrocyte sedimentation rate',
  section: 'Hematology',
  specimenType: 'Whole blood (EDTA)',
  turnaroundHours: 2,
  aliases: ['ESR', 'Sed rate'],
  analytes: [
    {
      key: 'esr',
      name: 'ESR',
      unit: 'mm/hr',
      kind: 'number',
      ranges: [
        { sex: 'male', low: 0, high: 15 },
        { sex: 'female', low: 0, high: 20 },
      ],
    },
  ],
  ...over,
});

describe('test definitions', () => {
  it('creates a test with an upper-case code and logs it', async () => {
    const { actor } = await setup();
    const r = await createTest(actor, esr());
    expect(r.ok).toBe(true);
    const t = await TestDefinition.findOne({ code: 'ESR' }).lean();
    expect(t?.sample).toBe(false);
    expect(await AuditEvent.countDocuments({ action: 'catalog.test-created' })).toBe(1);
  });

  it('points at the exact field that is wrong', async () => {
    const { actor } = await setup();
    const r = await createTest(
      actor,
      esr({
        analytes: [
          { key: 'esr', name: 'ESR', kind: 'number', ranges: [{ low: 20, high: 10 }], criticalLow: 5, criticalHigh: 1 },
          { key: 'esr', name: 'Again', kind: 'number', ranges: [] },
          { key: 'neg', name: 'Text', kind: 'text', ranges: [{}] },
        ],
      })
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors).toMatchObject({
      'analytes.0.ranges.0.high': expect.stringMatching(/below low/),
      'analytes.0.criticalHigh': expect.stringMatching(/above critical low/),
      'analytes.1.key': expect.stringMatching(/already uses/),
      'analytes.1.ranges': expect.stringMatching(/at least one/),
      'analytes.2.ranges.0.text': expect.stringMatching(/normal result/),
    });
  });

  it('refuses overlapping bands for the same patients', () => {
    expect(overlappingBands([{ sex: 'male' }, { sex: 'female' }])).toBeNull();
    expect(overlappingBands([{ ageMaxDays: 365 }, { ageMinDays: 365 }])).toBeNull();
    expect(overlappingBands([{ ageMaxDays: 400 }, { ageMinDays: 365 }])).toEqual([0, 1]);
    expect(overlappingBands([{ sex: 'any' }, {}])).toEqual([0, 1]);
  });

  it('refuses a code or common name another test already has', async () => {
    const { actor } = await setup();
    await createTest(actor, esr());
    const sameCode = await createTest(actor, esr({ aliases: [] }));
    expect(!sameCode.ok && sameCode.fieldErrors?.code).toMatch(/already uses/);
    const sameAlias = await createTest(actor, esr({ code: 'ESR2', aliases: ['sed-rate'] }));
    expect(!sameAlias.ok && sameAlias.fieldErrors?.aliases).toMatch(/Sed rate|sed-rate/);
  });

  it('adds sample tests once, marked as sample; ticking "checked" clears the mark', async () => {
    const { actor, labId } = await setup();
    expect(await addSampleTests(labId, actor)).toBe(5);
    expect(await addSampleTests(labId, actor)).toBe(0);
    const cbc = await TestDefinition.findOne({ code: 'CBC' }).lean();
    expect(cbc?.sample).toBe(true);
    const input = JSON.parse(JSON.stringify({ ...cbc, _id: undefined, labId: undefined }));
    expect((await updateTest(actor, String(cbc!._id), input)).ok).toBe(true);
    expect((await TestDefinition.findById(cbc!._id).lean())?.sample).toBe(true);
    expect((await updateTest(actor, String(cbc!._id), { ...input, rangesChecked: true })).ok).toBe(true);
    expect((await TestDefinition.findById(cbc!._id).lean())?.sample).toBe(false);
  });

  it('every sample test passes the editor’s own rules', async () => {
    const { actor, labId } = await setup();
    await addSampleTests(labId, actor);
    for (const t of await TestDefinition.find().lean()) {
      const input = JSON.parse(JSON.stringify({ ...t, _id: undefined, labId: undefined }));
      const r = await updateTest(actor, String(t._id), input);
      expect(r, t.code).toMatchObject({ ok: true });
    }
  });
});

describe('clinic test names', () => {
  it('matches by code first, then by name without case or punctuation', async () => {
    const { actor, clinicId, labId } = await setup();
    await addSampleTests(labId, actor);
    const cbc = await TestDefinition.findOne({ code: 'CBC' }).lean();
    const fbs = await TestDefinition.findOne({ code: 'FBS' }).lean();
    expect((await addMapping(actor, clinicId, { clinicTestType: 'CBC w/ Platelet', testId: String(cbc!._id) })).ok).toBe(true);
    expect((await addMapping(actor, clinicId, { clinicTestCode: 'GLU-F', testId: String(fbs!._id) })).ok).toBe(true);

    const byName = await resolveTest(clinicId, { type: 'cbc with platelet' });
    expect(byName.ok).toBe(false); // "with" is not "w"
    const byName2 = await resolveTest(clinicId, { type: 'CBC W PLATELET' });
    expect(byName2.ok && byName2.test.code).toBe('CBC');
    const byCode = await resolveTest(clinicId, { type: 'CBC w/ Platelet', code: 'glu-f' });
    expect(byCode.ok && byCode.test.code).toBe('FBS');
    expect(await resolveTest(clinicId, { type: 'Thyroid panel' })).toEqual({ ok: false, reason: 'unmapped' });
  });

  it('refuses a name the clinic already has and needs a name or code', async () => {
    const { actor, clinicId, labId } = await setup();
    await addSampleTests(labId, actor);
    const cbc = await TestDefinition.findOne({ code: 'CBC' }).lean();
    await addMapping(actor, clinicId, { clinicTestType: 'Hemogram', testId: String(cbc!._id) });
    const again = await addMapping(actor, clinicId, { clinicTestType: 'hemogram!', testId: String(cbc!._id) });
    expect(!again.ok && again.fieldErrors?.clinicTestType).toMatch(/already has/);
    const empty = await addMapping(actor, clinicId, { testId: String(cbc!._id) });
    expect(!empty.ok && empty.fieldErrors?.clinicTestType).toMatch(/name, its code, or both/);
  });

  it('adds every common name once, and a switched-off test stops matching', async () => {
    const { actor, clinicId, labId } = await setup();
    await addSampleTests(labId, actor);
    const first = await addCommonNames(actor, clinicId);
    expect(first.ok && first.added).toBeGreaterThan(15);
    const second = await addCommonNames(actor, clinicId);
    expect(second.ok && second.added).toBe(0);
    const ua = await resolveTest(clinicId, { type: 'Urinalysis' });
    expect(ua.ok).toBe(true);

    const test = await TestDefinition.findOne({ code: 'UA' }).lean();
    await setTestActive(actor, String(test!._id), false);
    expect(await resolveTest(clinicId, { type: 'Urinalysis' })).toEqual({ ok: false, reason: 'test-off' });
  });

  it('removes a name only for its own clinic', async () => {
    const { actor, clinicId, labId } = await setup();
    await addSampleTests(labId, actor);
    await addCommonNames(actor, clinicId);
    const m = await TestMapping.findOne({ clinicTestTypeKey: 'ua' }).lean();
    const other = await createClinic(actor, { name: 'Other', mcsLabCode: 'x-lab', platformHost: 'https://other.test' });
    expect((await removeMapping(actor, other.ok ? other.clinicId : '', String(m!._id))).ok).toBe(false);
    expect((await removeMapping(actor, clinicId, String(m!._id))).ok).toBe(true);
    expect((await resolveTest(clinicId, { type: 'UA' })).ok).toBe(false);
  });
});
