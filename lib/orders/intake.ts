import 'server-only';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { authenticateClinic } from '@/lib/clinics';
import { resolveTest } from '@/lib/catalog/mappings';
import { normaliseTestCode, normaliseTestName } from '@/lib/catalog/names';
import { connectDB } from '@/lib/db';
import { IntakeRefusal } from '@/models/IntakeRefusal';
import { Order } from '@/models/Order';
import { RateWindow } from '@/models/RateWindow';
import { URGENCIES } from './status';

// POST /v1/orders (docs/BUILD_PROMPT.md "Orders in"). Order of checks:
//   key → rate limit → body shape → repeat of a known requestCode (200, even if names changed since)
//   → patient → test name → store (201).
// Nothing slow happens here: MyClinicSoft waits at most 15 s, and we aim to answer within 2 s.

export const RATE_LIMIT_PER_MINUTE = 60;
export const MAX_BODY_BYTES = 64 * 1024;

export type IntakeReply = { status: number; body: unknown; headers?: Record<string, string> };

const err = (status: number, code: string, message: string, headers?: Record<string, string>): IntakeReply => ({
  status,
  body: { error: { code, message } },
  headers,
});

const text = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => v.trim() || undefined)
    .nullish()
    .transform((v) => v ?? undefined);

// Loose on purpose: unknown fields pass through and are kept (future orderCode, tests[], …).
const bodySchema = z.object({
  request: z.looseObject({
    requestCode: z.string().trim().min(1).max(64),
    patient: z.looseObject({
      firstName: text(100),
      lastName: text(100),
      dateOfBirth: text(40),
      gender: text(40),
      patientCode: text(64),
    }),
    test: z.looseObject({
      type: text(120),
      code: text(40),
      urgency: text(20),
    }),
    clinicalInfo: z
      .looseObject({ diagnosis: text(500), chiefComplaint: text(500) })
      .nullish(),
    instructions: text(1000),
  }),
});

/** "female", "F", "Female " → female; anything else is kept as text with no sex. */
export function sexFrom(gender: string | undefined): { sex?: 'male' | 'female'; genderText?: string } {
  if (!gender) return {};
  if (/^m(ale)?$/i.test(gender)) return { sex: 'male' };
  if (/^f(emale)?$/i.test(gender)) return { sex: 'female' };
  return { genderText: gender };
}

/** A real calendar date, YYYY-MM-DD, not in the future and not before 1900. */
export function validBirthDate(value: string, now = new Date()): boolean {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return false;
  return +m[1] >= 1900 && d.getTime() <= now.getTime();
}

export function newRequestId(): string {
  return `ord_${randomBytes(12).toString('base64url')}`;
}

/** Counts this request; true when the clinic is over the limit for this minute. */
async function overLimit(clinicId: string, now: Date): Promise<{ over: boolean; retryAfter: number }> {
  const minute = Math.floor(now.getTime() / 60_000);
  const w = await RateWindow.findOneAndUpdate(
    { key: `${clinicId}:${minute}` },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((minute + 2) * 60_000) } },
    { upsert: true, new: true, lean: true }
  );
  return { over: (w?.count ?? 0) > RATE_LIMIT_PER_MINUTE, retryAfter: Math.max(1, Math.ceil(((minute + 1) * 60_000 - now.getTime()) / 1000)) };
}

const KNOWN_REQUEST_KEYS = new Set(['requestCode', 'patient', 'test', 'clinicalInfo', 'instructions']);

export async function receiveOrder(input: { authorization: string | null; rawBody: string; now?: Date; ip?: string }): Promise<IntakeReply> {
  const now = input.now ?? new Date();
  const bearer = input.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const auth = await authenticateClinic(bearer, now);
  if (!auth.ok) {
    return auth.code === 'CLINIC_INACTIVE'
      ? err(403, 'CLINIC_INACTIVE', 'This clinic’s connection to the lab is switched off. Contact the lab.')
      : err(401, 'UNAUTHORIZED', 'The API key is missing, wrong or expired.');
  }
  const clinic = auth.clinic;
  const clinicId = String(clinic._id);

  const limit = await overLimit(clinicId, now);
  if (limit.over) return err(429, 'RATE_LIMITED', `More than ${RATE_LIMIT_PER_MINUTE} requests this minute. Try again shortly.`, { 'Retry-After': String(limit.retryAfter) });

  if (Buffer.byteLength(input.rawBody, 'utf8') > MAX_BODY_BYTES) return err(413, 'TOO_LARGE', 'The order is larger than 64 KB.');
  let json: unknown;
  try {
    json = JSON.parse(input.rawBody);
  } catch {
    return err(400, 'INVALID_REQUEST', 'The body is not valid JSON.');
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    const where = parsed.error.issues[0]?.path.join('.') || 'body';
    return err(400, 'INVALID_REQUEST', `The order is missing or has a wrong ${where}.`);
  }
  const req = parsed.data.request;

  await connectDB();
  const existing = await Order.findOne({ clinicId: clinic._id, requestCode: req.requestCode }).select('requestId status').lean();
  if (existing) return { status: 200, body: { requestId: existing.requestId, status: existing.status } };

  const p = req.patient;
  if (!p.firstName || !p.lastName) return err(422, 'INVALID_PATIENT', 'The patient’s first and last name are needed.');
  if (p.dateOfBirth && !validBirthDate(p.dateOfBirth, now)) return err(422, 'INVALID_PATIENT', 'The date of birth must be a real past date as YYYY-MM-DD.');

  const match = req.test.type || req.test.code ? await resolveTest(clinic._id, req.test) : ({ ok: false, reason: 'unmapped' } as const);
  if (!match.ok) {
    await noteRefusal(clinic.labId, clinic._id, req.test.type, req.test.code, match.reason, req.requestCode, now);
    return err(
      422,
      'UNKNOWN_TEST',
      match.reason === 'test-off'
        ? `The lab isn’t taking orders for “${req.test.type ?? req.test.code}” at the moment.`
        : `The lab has no test named “${req.test.type ?? req.test.code ?? ''}” for this clinic.`
    );
  }

  const urgency = (URGENCIES as readonly string[]).includes(req.test.urgency?.toLowerCase() ?? '') ? (req.test.urgency!.toLowerCase() as (typeof URGENCIES)[number]) : 'routine';
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(req)) if (!KNOWN_REQUEST_KEYS.has(k)) extras[k] = v;
  if (req.test.urgency && req.test.urgency.toLowerCase() !== urgency) extras.urgencySent = req.test.urgency;

  const requestId = newRequestId();
  try {
    await Order.create({
      labId: clinic.labId,
      requestId,
      clinicId: clinic._id,
      requestCode: req.requestCode,
      urgency,
      patient: { firstName: p.firstName, lastName: p.lastName, dateOfBirth: p.dateOfBirth, patientCode: p.patientCode, ...sexFrom(p.gender) },
      test: { type: req.test.type, code: req.test.code, testId: match.test._id, labCode: match.test.code, labName: match.test.name },
      clinicalInfo: req.clinicalInfo ? { diagnosis: req.clinicalInfo.diagnosis, chiefComplaint: req.clinicalInfo.chiefComplaint } : undefined,
      instructions: req.instructions,
      extras: Object.keys(extras).length ? extras : undefined,
      status: 'received',
      statusHistory: [{ status: 'received', at: now, by: clinic.name }],
      receivedAt: now,
    });
  } catch (error) {
    // The same order sent twice at once: the second insert loses the race; answer as a repeat.
    if ((error as { code?: number }).code === 11000) {
      const winner = await Order.findOne({ clinicId: clinic._id, requestCode: req.requestCode }).select('requestId status').lean();
      if (winner) return { status: 200, body: { requestId: winner.requestId, status: winner.status } };
    }
    throw error;
  }
  await audit({
    action: 'order.received',
    labId: clinic.labId,
    actor: `clinic:${clinic.name}`,
    entity: 'Order',
    entityId: requestId,
    after: { requestCode: req.requestCode, test: match.test.code, urgency },
    ip: input.ip,
  });
  return { status: 201, body: { requestId, status: 'received' } };
}

async function noteRefusal(
  labId: unknown,
  clinicId: unknown,
  type: string | undefined,
  code: string | undefined,
  reason: 'unmapped' | 'test-off',
  requestCode: string,
  now: Date
) {
  try {
    const typeKey = type ? normaliseTestName(type) : undefined;
    const codeKey = code ? normaliseTestCode(code) : undefined;
    const key = `${typeKey ?? ''}|${codeKey ?? ''}`;
    await IntakeRefusal.updateOne(
      { clinicId, key },
      { $set: { labId, typeKey, codeKey, testType: type, testCode: code, reason, lastRequestCode: requestCode, lastAt: now }, $inc: { count: 1 }, $setOnInsert: { firstAt: now } },
      { upsert: true }
    );
  } catch (error) {
    console.error('Could not note a refused order', error);
  }
}
