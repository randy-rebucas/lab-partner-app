import 'server-only';
import { Types } from 'mongoose';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { connectDB } from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session-store';
import type { Result } from '@/lib/users';
import { ConnectedClinic } from '@/models/ConnectedClinic';
import { IntakeRefusal } from '@/models/IntakeRefusal';
import { TestDefinition, type TestDefinitionDoc } from '@/models/TestDefinition';
import { TestMapping } from '@/models/TestMapping';
import { normaliseTestCode, normaliseTestName } from './names';

// Clinic test names → catalog tests (FR-8). An order whose test matches no mapping is refused with
// 422 UNKNOWN_TEST, so the lab never receives a test it hasn't agreed to do.

const mappingSchema = z
  .object({
    clinicTestType: z.string().trim().max(120).optional().transform((v) => v || undefined),
    clinicTestCode: z.string().trim().max(40).optional().transform((v) => v || undefined),
    testId: z.string().refine((v) => Types.ObjectId.isValid(v), 'Choose a test from the catalog.'),
  })
  .superRefine((m, ctx) => {
    if (!m.clinicTestType && !m.clinicTestCode) ctx.addIssue({ code: 'custom', path: ['clinicTestType'], message: 'Enter the clinic’s test name, its code, or both.' });
    if (m.clinicTestType && !normaliseTestName(m.clinicTestType)) ctx.addIssue({ code: 'custom', path: ['clinicTestType'], message: 'Enter a name with letters or digits.' });
  });

async function ownClinic(actor: SessionUser, clinicId: string) {
  if (!Types.ObjectId.isValid(clinicId)) return null;
  await connectDB();
  return ConnectedClinic.findOne({ _id: clinicId, labId: actor.labId }).select('_id name').lean();
}

export async function addMapping(actor: SessionUser, clinicId: string, input: unknown, ip?: string): Promise<Result> {
  const parsed = mappingSchema.safeParse(input);
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const i of parsed.error.issues) fe[String(i.path[0])] ??= i.message;
    return { ok: false, fieldErrors: fe };
  }
  const clinic = await ownClinic(actor, clinicId);
  if (!clinic) return { ok: false, error: 'That clinic is no longer connected.' };
  const test = await TestDefinition.findOne({ _id: parsed.data.testId, labId: actor.labId }).select('name').lean();
  if (!test) return { ok: false, fieldErrors: { testId: 'Choose a test from the catalog.' } };

  const typeKey = parsed.data.clinicTestType ? normaliseTestName(parsed.data.clinicTestType) : undefined;
  const codeKey = parsed.data.clinicTestCode ? normaliseTestCode(parsed.data.clinicTestCode) : undefined;
  const fe: Record<string, string> = {};
  if (typeKey && (await TestMapping.exists({ clinicId, clinicTestTypeKey: typeKey }))) fe.clinicTestType = 'This clinic already has this test name.';
  if (codeKey && (await TestMapping.exists({ clinicId, clinicTestCodeKey: codeKey }))) fe.clinicTestCode = 'This clinic already has this test code.';
  if (Object.keys(fe).length) return { ok: false, fieldErrors: fe };

  try {
    const m = await TestMapping.create({
      labId: actor.labId,
      clinicId,
      clinicTestType: parsed.data.clinicTestType,
      clinicTestTypeKey: typeKey,
      clinicTestCode: parsed.data.clinicTestCode,
      clinicTestCodeKey: codeKey,
      testId: parsed.data.testId,
    });
    await clearRefusals(clinicId, typeKey ? [typeKey] : [], codeKey);
    await audit({ action: 'catalog.mapping-added', labId: actor.labId, userId: actor.id, entity: 'TestMapping', entityId: m._id, after: { clinicId, ...parsed.data }, ip });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return { ok: false, error: 'This clinic already has that name or code.' };
    throw error;
  }
  return { ok: true };
}

/** Once a name or code is added, refusals for it are no longer something to act on. */
async function clearRefusals(clinicId: string, typeKeys: string[], codeKey?: string) {
  const or = [...(typeKeys.length ? [{ typeKey: { $in: typeKeys } }] : []), ...(codeKey ? [{ codeKey }] : [])];
  if (or.length) await IntakeRefusal.deleteMany({ clinicId, $or: or });
}

export async function removeMapping(actor: SessionUser, clinicId: string, mappingId: string, ip?: string): Promise<Result> {
  if (!Types.ObjectId.isValid(mappingId)) return { ok: false, error: 'That name is already removed.' };
  await connectDB();
  const m = await TestMapping.findOneAndDelete({ _id: mappingId, clinicId, labId: actor.labId }).lean();
  if (!m) return { ok: false, error: 'That name is already removed.' };
  await audit({ action: 'catalog.mapping-removed', labId: actor.labId, userId: actor.id, entity: 'TestMapping', entityId: mappingId, before: m, ip });
  return { ok: true };
}

/** Maps every common name of every active test for this clinic, skipping names it already has. */
export async function addCommonNames(actor: SessionUser, clinicId: string, ip?: string): Promise<Result<{ added: number }>> {
  const clinic = await ownClinic(actor, clinicId);
  if (!clinic) return { ok: false, error: 'That clinic is no longer connected.' };
  const [tests, existing] = await Promise.all([
    TestDefinition.find({ labId: actor.labId, active: true }).select('aliases').lean(),
    TestMapping.find({ clinicId }).select('clinicTestTypeKey').lean(),
  ]);
  const have = new Set(existing.map((m) => m.clinicTestTypeKey).filter(Boolean));
  const docs = [];
  for (const t of tests) {
    for (const alias of t.aliases) {
      const key = normaliseTestName(alias);
      if (!key || have.has(key)) continue;
      have.add(key);
      docs.push({ labId: actor.labId, clinicId, clinicTestType: alias, clinicTestTypeKey: key, testId: t._id });
    }
  }
  if (docs.length) {
    await TestMapping.insertMany(docs, { ordered: false });
    await clearRefusals(clinicId, docs.map((d) => d.clinicTestTypeKey));
    await audit({ action: 'catalog.common-names-added', labId: actor.labId, userId: actor.id, entity: 'ConnectedClinic', entityId: clinicId, after: { names: docs.map((d) => d.clinicTestType) }, ip });
  }
  return { ok: true, added: docs.length };
}

export type TestMatch =
  | { ok: true; test: TestDefinitionDoc }
  | { ok: false; reason: 'unmapped' | 'test-off' };

/**
 * The catalog test for an incoming order's test. A code match wins over a name match, since
 * codes don't drift with spelling. A mapping to a switched-off test counts as unmapped for the
 * clinic (422 UNKNOWN_TEST), with its own reason for the lab's log.
 */
export async function resolveTest(clinicId: Types.ObjectId | string, test: { type?: string | null; code?: string | null }): Promise<TestMatch> {
  await connectDB();
  const codeKey = test.code ? normaliseTestCode(test.code) : '';
  const typeKey = test.type ? normaliseTestName(test.type) : '';
  let mapping = codeKey ? await TestMapping.findOne({ clinicId, clinicTestCodeKey: codeKey }).select('testId').lean() : null;
  if (!mapping && typeKey) mapping = await TestMapping.findOne({ clinicId, clinicTestTypeKey: typeKey }).select('testId').lean();
  if (!mapping) return { ok: false, reason: 'unmapped' };
  const found = await TestDefinition.findById(mapping.testId).lean<TestDefinitionDoc>();
  if (!found || !found.active) return { ok: false, reason: 'test-off' };
  return { ok: true, test: found };
}
