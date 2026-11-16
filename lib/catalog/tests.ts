import 'server-only';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { connectDB } from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session-store';
import type { Result } from '@/lib/users';
import { TestDefinition } from '@/models/TestDefinition';
import { normaliseTestName, SECTIONS, SPECIMEN_TYPES } from './names';
import { SAMPLE_TESTS } from './sample';

// The test catalog (FR-7). The editor sends the whole test as JSON; every rule is checked here so
// a hand-made request can't store a test the flagging can't use.

const num = z.number().finite().nullable().optional();
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || undefined);

const rangeSchema = z
  .object({
    sex: z.enum(['any', 'male', 'female']).default('any'),
    ageMinDays: z.number().int().min(0).nullable().optional(),
    ageMaxDays: z.number().int().min(1).nullable().optional(),
    low: num,
    high: num,
    text: optText(80),
  })
  .superRefine((r, ctx) => {
    if (r.low != null && r.high != null && r.low > r.high) ctx.addIssue({ code: 'custom', path: ['high'], message: 'High must not be below low.' });
    if (r.ageMinDays != null && r.ageMaxDays != null && r.ageMinDays >= r.ageMaxDays)
      ctx.addIssue({ code: 'custom', path: ['ageMaxDays'], message: 'The upper age must be above the lower one.' });
  });

const analyteSchema = z
  .object({
    key: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{0,31}$/, 'Start with a letter; use lowercase letters, digits and _ only.'),
    name: z.string().trim().min(1, 'Enter the analyte name.').max(80),
    unit: optText(30),
    kind: z.enum(['number', 'text']).default('number'),
    ranges: z.array(rangeSchema).max(20),
    criticalLow: num,
    criticalHigh: num,
  })
  .superRefine((a, ctx) => {
    if (a.kind === 'number') {
      if (!a.ranges.length) ctx.addIssue({ code: 'custom', path: ['ranges'], message: 'Add at least one reference range.' });
      a.ranges.forEach((r, i) => {
        if (r.low == null && r.high == null) ctx.addIssue({ code: 'custom', path: ['ranges', i, 'low'], message: 'Enter a low, a high, or both.' });
      });
    } else {
      a.ranges.forEach((r, i) => {
        if (!r.text) ctx.addIssue({ code: 'custom', path: ['ranges', i, 'text'], message: 'Enter the normal result, for example Negative.' });
      });
    }
    if (a.criticalLow != null && a.criticalHigh != null && a.criticalLow >= a.criticalHigh)
      ctx.addIssue({ code: 'custom', path: ['criticalHigh'], message: 'Critical high must be above critical low.' });
    const overlap = overlappingBands(a.ranges);
    if (overlap) ctx.addIssue({ code: 'custom', path: ['ranges', overlap[1], 'sex'], message: `This range covers the same patients as range ${overlap[0] + 1}.` });
  });

export const testSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{1,20}$/, 'Use up to 20 letters, digits, dashes or underscores.')
      .transform((v) => v.toUpperCase()),
    loinc: z
      .string()
      .trim()
      .regex(/^(\d{1,7}-\d)?$/, 'A LOINC code looks like 58410-2.')
      .optional()
      .transform((v) => v || undefined),
    name: z.string().trim().min(2, 'Enter the test name.').max(120),
    section: z.enum(SECTIONS, { message: 'Choose a section.' }),
    specimenType: z.enum(SPECIMEN_TYPES, { message: 'Choose a specimen type.' }),
    turnaroundHours: z.number({ message: 'Enter the turnaround target in hours.' }).int('Use whole hours.').min(1, 'At least 1 hour.').max(24 * 30),
    aliases: z.array(z.string().trim().min(1).max(80)).max(30),
    analytes: z.array(analyteSchema).min(1, 'Add at least one analyte.').max(60),
    active: z.boolean().default(true),
    rangesChecked: z.boolean().optional(),
  })
  .superRefine((t, ctx) => {
    const seen = new Map<string, number>();
    t.analytes.forEach((a, i) => {
      if (seen.has(a.key)) ctx.addIssue({ code: 'custom', path: ['analytes', i, 'key'], message: `Analyte ${seen.get(a.key)! + 1} already uses this key.` });
      else seen.set(a.key, i);
    });
  });

export type TestInput = z.input<typeof testSchema>;

/** Indexes [i, j] of the first two bands for the same sex whose age bands overlap, else null. */
export function overlappingBands(ranges: { sex?: string | null; ageMinDays?: number | null; ageMaxDays?: number | null }[]): [number, number] | null {
  for (let j = 0; j < ranges.length; j++) {
    for (let i = 0; i < j; i++) {
      const a = ranges[i];
      const b = ranges[j];
      if ((a.sex ?? 'any') !== (b.sex ?? 'any')) continue;
      const aMin = a.ageMinDays ?? 0;
      const aMax = a.ageMaxDays ?? Infinity;
      const bMin = b.ageMinDays ?? 0;
      const bMax = b.ageMaxDays ?? Infinity;
      if (aMin < bMax && bMin < aMax) return [i, j];
    }
  }
  return null;
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[issue.path.join('.') || 'form'] ??= issue.message;
  return out;
}

/** Aliases cleaned: blanks and repeats (by normalised name) dropped. */
function cleanAliases(aliases: string[]): string[] {
  const seen = new Set<string>();
  return aliases.filter((a) => {
    const k = normaliseTestName(a);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** A common name can point at one test only, or "Add common names" wouldn't know which to map. */
async function aliasClash(labId: string, aliases: string[], exceptId?: string): Promise<string | null> {
  if (!aliases.length) return null;
  const others = await TestDefinition.find({ labId, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).select('name aliases').lean();
  for (const alias of aliases) {
    const k = normaliseTestName(alias);
    const other = others.find((o) => o.aliases.some((x) => normaliseTestName(x) === k));
    if (other) return `“${alias}” is already a common name of ${other.name}.`;
  }
  return null;
}

type Parsed = Omit<z.output<typeof testSchema>, 'rangesChecked'>;

async function parse(labId: string, input: unknown, exceptId?: string): Promise<Result<{ data: Parsed; rangesChecked?: boolean }>> {
  const parsed = testSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Check the highlighted fields.', fieldErrors: fieldErrors(parsed.error) };
  const { rangesChecked, ...data } = parsed.data;
  data.aliases = cleanAliases(data.aliases);
  await connectDB();
  const clash = await aliasClash(labId, data.aliases, exceptId);
  if (clash) return { ok: false, error: 'Check the highlighted fields.', fieldErrors: { aliases: clash } };
  const sameCode = await TestDefinition.exists({ labId, code: data.code, ...(exceptId ? { _id: { $ne: exceptId } } : {}) });
  if (sameCode) return { ok: false, error: 'Check the highlighted fields.', fieldErrors: { code: 'Another test already uses this code.' } };
  return { ok: true, data, rangesChecked };
}

export async function createTest(actor: SessionUser, input: unknown, ip?: string): Promise<Result<{ testId: string }>> {
  const parsed = await parse(actor.labId, input);
  if (!parsed.ok) return parsed;
  const test = await TestDefinition.create({ ...parsed.data, labId: actor.labId, sample: false });
  await audit({ action: 'catalog.test-created', labId: actor.labId, userId: actor.id, entity: 'TestDefinition', entityId: test._id, after: parsed.data, ip });
  return { ok: true, testId: String(test._id) };
}

export async function updateTest(actor: SessionUser, testId: string, input: unknown, ip?: string): Promise<Result> {
  const parsed = await parse(actor.labId, input, testId);
  if (!parsed.ok) return parsed;
  const before = await TestDefinition.findOne({ _id: testId, labId: actor.labId }).lean();
  if (!before) return { ok: false, error: 'That test is no longer in the catalog.' };
  const set: Record<string, unknown> = { ...parsed.data };
  if (before.sample && parsed.rangesChecked) set.sample = false;
  await TestDefinition.updateOne({ _id: testId }, { $set: set });
  const beforeFields = Object.fromEntries(Object.keys(set).map((k) => [k, (before as Record<string, unknown>)[k]]));
  await audit({ action: 'catalog.test-updated', labId: actor.labId, userId: actor.id, entity: 'TestDefinition', entityId: testId, before: beforeFields, after: set, ip });
  return { ok: true };
}

/** Adds the sample tests whose codes aren't in the catalog yet. Returns how many were added. */
export async function addSampleTests(labId: string, actor?: SessionUser, ip?: string): Promise<number> {
  await connectDB();
  const existing = new Set((await TestDefinition.find({ labId }).select('code').lean()).map((t) => t.code));
  const taken = new Set((await TestDefinition.find({ labId }).select('aliases').lean()).flatMap((t) => t.aliases.map(normaliseTestName)));
  const fresh = SAMPLE_TESTS.filter((t) => !existing.has(t.code)).map((t) => ({
    ...t,
    aliases: t.aliases.filter((a) => !taken.has(normaliseTestName(a))),
    labId,
    sample: true,
  }));
  if (!fresh.length) return 0;
  await TestDefinition.insertMany(fresh);
  await audit({ action: 'catalog.sample-added', labId, userId: actor?.id, entity: 'TestDefinition', after: { codes: fresh.map((t) => t.code) }, ip });
  return fresh.length;
}

/** Tests are never deleted (orders point at them); a switched-off test refuses new orders. */
export async function setTestActive(actor: SessionUser, testId: string, active: boolean, ip?: string): Promise<Result> {
  await connectDB();
  const result = await TestDefinition.updateOne({ _id: testId, labId: actor.labId }, { $set: { active } });
  if (!result.matchedCount) return { ok: false, error: 'That test is no longer in the catalog.' };
  await audit({ action: active ? 'catalog.test-switched-on' : 'catalog.test-switched-off', labId: actor.labId, userId: actor.id, entity: 'TestDefinition', entityId: testId, ip });
  return { ok: true };
}
