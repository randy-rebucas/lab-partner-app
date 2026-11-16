import 'server-only';
import { randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import { audit } from '@/lib/audit';
import { connectDB } from '@/lib/db';
import { hasAnyRole } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session-store';
import { ageInDays, flagValue, formatRange, pickRange, type Sex } from '@/lib/catalog/flags';
import { buildPayload } from '@/lib/delivery/payload';
import { transitionOrder } from '@/lib/orders/transition';
import type { Result as R } from '@/lib/users';
import { manilaInputToDate } from '@/lib/specimen-options';
import { Delivery } from '@/models/Delivery';
import { Lab } from '@/models/Lab';
import { Order, type OrderDoc } from '@/models/Order';
import { Result, type ResultDoc } from '@/models/Result';
import { Specimen } from '@/models/Specimen';
import { TestDefinition, type TestDefinitionDoc } from '@/models/TestDefinition';

// Result entry (FR-10), validation and release (FR-13, FR-14), corrections (FR-16).
// Rules live here so no page or action can skip one.

export const ENTER_ROLES = ['medtech', 'signatory'] as const;

/** "Not done", or a number, or a bound like "<0.5" / ">1000" for a number analyte. */
const NUMBERISH = /^(not done|[<>]=?\s*[-+]?\d*\.?\d+|[-+]?[\d,]*\.?\d+)$/i;

type ValueInput = Record<string, string>;
export type ComputedValue = { key: string; name: string; unit?: string; kind: 'number' | 'text'; value: string; flag: 'H' | 'L' | 'C' | null; direction: 'high' | 'low' | null; range: string };

/** Values with flags and the range for this patient, from the catalog test and what was typed. */
export function computeValues(
  test: Pick<TestDefinitionDoc, 'analytes'>,
  patient: { sex?: string | null; dateOfBirth?: string | null },
  collectedAt: Date,
  input: ValueInput
): ComputedValue[] {
  const sex = patient.sex === 'male' || patient.sex === 'female' ? (patient.sex as Sex) : undefined;
  const age = ageInDays(patient.dateOfBirth, collectedAt);
  return test.analytes.map((a) => {
    const value = (input[a.key] ?? '').trim().slice(0, 60);
    const kind = (a.kind ?? 'number') as 'number' | 'text';
    const band = pickRange(a.ranges, sex, age);
    const f = value ? flagValue({ ...a, kind, ranges: a.ranges }, value, sex, age) : { flag: null, direction: null };
    return { key: a.key, name: a.name, unit: a.unit ?? undefined, kind, value, flag: f.flag, direction: f.direction, range: formatRange(band, kind === 'text' ? null : a.unit) };
  });
}

function valueErrors(values: ComputedValue[], requireAll: boolean): Record<string, string> {
  const fe: Record<string, string> = {};
  for (const v of values) {
    if (!v.value) {
      if (requireAll) fe[`v.${v.key}`] = 'Enter a value, or “Not done”.';
    } else if (v.kind === 'number' && !NUMBERISH.test(v.value)) {
      fe[`v.${v.key}`] = 'Enter a number (for example 13.2, <0.5) or “Not done”.';
    }
  }
  return fe;
}

export type ResultContext = { order: OrderDoc; test: TestDefinitionDoc; collectedAt: Date; accessionNo: string; current: ResultDoc | null; versions: ResultDoc[] };

/** The order, its test, its specimen and every result version, newest first. */
export async function resultContext(labId: string, orderId: string): Promise<ResultContext | null> {
  if (!Types.ObjectId.isValid(orderId)) return null;
  await connectDB();
  const order = await Order.findOne({ _id: orderId, labId }).lean<OrderDoc>();
  if (!order) return null;
  const [test, specimen, versions] = await Promise.all([
    TestDefinition.findById(order.test?.testId).lean<TestDefinitionDoc>(),
    order.specimenId ? Specimen.findById(order.specimenId).select('collectedAt accessionNo status').lean() : null,
    Result.find({ orderId }).sort({ version: -1 }).lean<ResultDoc[]>(),
  ]);
  if (!test) return null;
  return {
    order,
    test,
    collectedAt: specimen?.collectedAt ?? order.receivedAt,
    accessionNo: specimen?.accessionNo ?? order.accessionNo ?? '',
    current: versions[0] ?? null,
    versions,
  };
}

const NO_ORDER = { ok: false, error: 'That order no longer exists.' } as const;

/** Save typed values; with `submit`, send them for validation. Collected → in progress → awaiting validation. */
export async function saveResult(
  actor: SessionUser,
  orderId: string,
  input: { values: ValueInput; interpretation?: string; submit: boolean },
  ip?: string
): Promise<R<{ submitted: boolean }>> {
  if (!hasAnyRole(actor.roles, ENTER_ROLES)) return { ok: false, error: 'Only medical technologists and signatories enter results.' };
  const ctx = await resultContext(actor.labId, orderId);
  if (!ctx) return NO_ORDER;
  const status = ctx.order.status;
  if (status !== 'collected' && status !== 'in-progress') return { ok: false, error: 'This order isn’t open for results. The page has been updated.' };
  const values = computeValues(ctx.test, ctx.order.patient ?? {}, ctx.collectedAt, input.values);
  const fe = valueErrors(values, input.submit);
  if (Object.keys(fe).length) return { ok: false, error: input.submit ? 'Every value is needed before validation.' : 'Check the highlighted values.', fieldErrors: fe };
  const interpretation = input.interpretation?.trim().slice(0, 1000) || undefined;
  const now = new Date();

  if (status === 'collected') {
    const moved = await transitionOrder(actor, orderId, 'in-progress', { ip, note: 'Result entry started', expectFrom: ['collected'] });
    if (!moved.ok) return moved;
  }
  const draft = ctx.current && ctx.current.status === 'draft' ? ctx.current : null;
  const fields = {
    values,
    interpretation,
    enteredById: actor.id,
    enteredBy: actor.name,
    enteredByLicence: actor.licenceNo ?? undefined,
    enteredAt: now,
    ...(input.submit ? { status: 'submitted', submittedAt: now } : {}),
  };
  let resultId: string;
  if (draft) {
    await Result.updateOne({ _id: draft._id, status: 'draft' }, { $set: fields });
    resultId = String(draft._id);
  } else {
    const version = (ctx.versions[0]?.version ?? 0) + 1;
    const created = await Result.create({ labId: actor.labId, orderId, version, status: 'draft', ...fields });
    resultId = String(created._id);
  }
  if (input.submit) {
    const moved = await transitionOrder(actor, orderId, 'awaiting-validation', { ip, note: 'Sent for validation', expectFrom: ['in-progress'] });
    if (!moved.ok) {
      await Result.updateOne({ _id: resultId }, { $set: { status: 'draft' }, $unset: { submittedAt: 1 } });
      return moved;
    }
  }
  await audit({
    action: input.submit ? 'result.submitted' : 'result.saved',
    labId: actor.labId,
    userId: actor.id,
    entity: 'Result',
    entityId: resultId,
    after: { values: values.map((v) => ({ key: v.key, value: v.value, flag: v.flag })) },
    ip,
  });
  return { ok: true, submitted: input.submit };
}

function submittedOf(ctx: ResultContext): ResultDoc | null {
  return ctx.current && ctx.current.status === 'submitted' && ctx.order.status === 'awaiting-validation' ? ctx.current : null;
}

export async function sendBack(actor: SessionUser, orderId: string, note: string, ip?: string): Promise<R> {
  if (!hasAnyRole(actor.roles, ['signatory'])) return { ok: false, error: 'Only a signatory sends results back.' };
  const text = note.trim().slice(0, 300);
  if (!text) return { ok: false, fieldErrors: { note: 'Say what needs correcting.' } };
  const ctx = await resultContext(actor.labId, orderId);
  if (!ctx) return NO_ORDER;
  const r = submittedOf(ctx);
  if (!r) return { ok: false, error: 'This result isn’t waiting for validation. The page has been updated.' };
  const moved = await transitionOrder(actor, orderId, 'in-progress', { ip, note: `Sent back: ${text}`, expectFrom: ['awaiting-validation'] });
  if (!moved.ok) return moved;
  await Result.updateOne({ _id: r._id }, { $set: { status: 'draft', sentBackNote: text } });
  return { ok: true };
}

export async function recordCriticalCall(actor: SessionUser, orderId: string, input: { takenBy: string; at: string; note?: string }, now = new Date(), ip?: string): Promise<R> {
  if (!hasAnyRole(actor.roles, ['medtech', 'signatory'])) return { ok: false, error: 'Only medical technologists and signatories record calls.' };
  const fe: Record<string, string> = {};
  const takenBy = input.takenBy.trim().slice(0, 120);
  if (takenBy.length < 2) fe.takenBy = 'Enter who took the call at the clinic.';
  const at = manilaInputToDate(input.at);
  if (!at) fe.at = 'Enter when the call was made.';
  else if (at.getTime() > now.getTime() + 2 * 60_000) fe.at = 'The call time can’t be in the future.';
  if (Object.keys(fe).length) return { ok: false, fieldErrors: fe };
  const ctx = await resultContext(actor.labId, orderId);
  if (!ctx) return NO_ORDER;
  const r = submittedOf(ctx);
  if (!r) return { ok: false, error: 'This result isn’t waiting for validation. The page has been updated.' };
  if (!r.values.some((v) => v.flag === 'C')) return { ok: false, error: 'This result has no critical value.' };
  const call = { calledById: actor.id, calledBy: actor.name, takenBy, at, note: input.note?.trim().slice(0, 300) || undefined };
  await Result.updateOne({ _id: r._id }, { $set: { criticalCall: call } });
  await audit({ action: 'result.critical-call', labId: actor.labId, userId: actor.id, entity: 'Result', entityId: r._id, after: { takenBy, at }, ip });
  return { ok: true };
}

/** 12 random Crockford base32 characters, shown as XXXX-XXXX-XXXX. */
export function newReportSerial(): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const bytes = randomBytes(12);
  const chars = Array.from(bytes, (b) => alphabet[b % 32]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

/** Why this person can't release this result now, or null. */
export function releaseBlocker(actor: Pick<SessionUser, 'id' | 'roles' | 'licenceNo'>, r: Pick<ResultDoc, 'enteredById' | 'values' | 'criticalCall'>): string | null {
  if (!hasAnyRole(actor.roles, ['signatory'])) return 'Only a signatory releases results.';
  if (!actor.licenceNo) return 'Your account has no licence number, which the report must print. Ask an admin to add it.';
  if (String(r.enteredById) === actor.id) return 'You entered these values, so another signatory must release them.';
  if (r.values.some((v) => v.flag === 'C') && !r.criticalCall?.at) return 'Record the call to the clinic about the critical value first.';
  return null;
}

/** Release: report serial, frozen webhook body, order released. Returns the delivery to send. */
export async function releaseResult(actor: SessionUser, orderId: string, ip?: string): Promise<R<{ deliveryId: string; serial: string }>> {
  const ctx = await resultContext(actor.labId, orderId);
  if (!ctx) return NO_ORDER;
  const r = submittedOf(ctx);
  if (!r) return { ok: false, error: 'This result isn’t waiting for validation. The page has been updated.' };
  const blocker = releaseBlocker(actor, r);
  if (blocker) return { ok: false, error: blocker };

  const now = new Date();
  const serial = newReportSerial();
  const resultIdString = `${ctx.accessionNo || ctx.order.requestId}-v${r.version}`;
  const claimed = await Result.updateOne(
    { _id: r._id, status: 'submitted' },
    { $set: { status: 'released', releasedById: actor.id, releasedBy: actor.name, releasedByLicence: actor.licenceNo, releasedAt: now, reportSerial: serial, resultIdString } }
  );
  if (!claimed.modifiedCount) return { ok: false, error: 'Someone released this result just now. The page has been updated.' };
  const moved = await transitionOrder(actor, orderId, 'released', { ip, note: `Released ${resultIdString}`, expectFrom: ['awaiting-validation'] });
  if (!moved.ok) {
    await Result.updateOne({ _id: r._id }, { $set: { status: 'submitted' }, $unset: { releasedById: 1, releasedBy: 1, releasedByLicence: 1, releasedAt: 1, reportSerial: 1, resultIdString: 1 } });
    return moved;
  }
  const lab = await Lab.findById(actor.labId).select('name').lean();
  const body = JSON.stringify(
    buildPayload({
      requestId: ctx.order.requestId,
      requestCode: ctx.order.requestCode,
      resultIdString,
      testType: ctx.order.test?.type || ctx.order.test?.labName || ctx.test.name,
      values: r.values,
      interpretation: r.interpretation,
      amendReason: r.amendReason,
      releasedAt: now,
      labName: lab?.name ?? 'Lab',
    })
  );
  const delivery = await Delivery.create({ labId: actor.labId, resultId: r._id, orderId, clinicId: ctx.order.clinicId, resultIdString, body, nextAttemptAt: now });
  await audit({ action: 'result.released', labId: actor.labId, userId: actor.id, entity: 'Result', entityId: r._id, after: { resultIdString, serial }, ip });
  return { ok: true, deliveryId: String(delivery._id), serial };
}

/** A correction (FR-16): version n+1 with a reason, entered values, back to validation. */
export async function amendResult(
  actor: SessionUser,
  orderId: string,
  input: { values: ValueInput; interpretation?: string; reason: string },
  ip?: string
): Promise<R> {
  if (!hasAnyRole(actor.roles, ENTER_ROLES)) return { ok: false, error: 'Only medical technologists and signatories correct results.' };
  const reason = input.reason.trim().slice(0, 300);
  const ctx = await resultContext(actor.labId, orderId);
  if (!ctx) return NO_ORDER;
  const released = ctx.current?.status === 'released' && !ctx.current.supersededBy ? ctx.current : null;
  if (!released || (ctx.order.status !== 'released' && ctx.order.status !== 'delivered')) return { ok: false, error: 'Only a released result can be corrected. The page has been updated.' };
  const values = computeValues(ctx.test, ctx.order.patient ?? {}, ctx.collectedAt, input.values);
  const fe = valueErrors(values, true);
  if (reason.length < 5) fe.reason = 'Say why the result is being corrected; the clinic sees this.';
  if (Object.keys(fe).length) return { ok: false, error: 'Check the highlighted fields.', fieldErrors: fe };
  const now = new Date();
  const created = await Result.create({
    labId: actor.labId,
    orderId,
    version: released.version + 1,
    status: 'submitted',
    values,
    interpretation: input.interpretation?.trim().slice(0, 1000) || undefined,
    attachments: released.attachments,
    enteredById: actor.id,
    enteredBy: actor.name,
    enteredByLicence: actor.licenceNo ?? undefined,
    enteredAt: now,
    submittedAt: now,
    amendReason: reason,
  });
  const moved = await transitionOrder(actor, orderId, 'awaiting-validation', { ip, note: `Correction v${released.version + 1}: ${reason}`, expectFrom: ['released', 'delivered'] });
  if (!moved.ok) {
    await Result.deleteOne({ _id: created._id });
    return moved;
  }
  await Result.updateOne({ _id: released._id }, { $set: { supersededBy: created._id } });
  await audit({ action: 'result.amended', labId: actor.labId, userId: actor.id, entity: 'Result', entityId: created._id, before: { version: released.version }, after: { version: released.version + 1, reason }, ip });
  return { ok: true };
}

