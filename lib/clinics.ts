import 'server-only';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { connectDB } from '@/lib/db';
import { decryptSecret, encryptSecret, safeEqual, sha256 } from '@/lib/crypto';
import type { SessionUser } from '@/lib/auth/session-store';
import type { Result } from '@/lib/users';
import { ConnectedClinic, type ConnectedClinicDoc } from '@/models/ConnectedClinic';

// Connected clinics and their credentials (FR-19, part two).
// - API key: the clinic's MyClinicSoft sends it as `Authorization: Bearer` on orders.
// - Webhook secret: this lab signs results with it; MyClinicSoft verifies them.
// Both are shown once, at creation or rotation.

export const KEY_OVERLAP_MS = 7 * 24 * 60 * 60 * 1000;

export function newApiKey(): { key: string; prefix: string; hash: string } {
  const prefix = randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').slice(0, 8);
  const key = `lpk_${prefix}_${randomBytes(24).toString('base64url')}`;
  return { key, prefix, hash: sha256(key) };
}

export function newWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString('base64url')}`;
}

/** Where results go: https in production; http to this machine only during development. */
export function platformHostProblem(raw: string, production = process.env.NODE_ENV === 'production'): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'Enter the full address, starting with https://';
  }
  if (url.username || url.password) return 'Leave out any user name or password.';
  if (url.pathname !== '/' || url.search || url.hash) return 'Enter only the address, without a path (for example https://reyesclinic.myclinicsoft.com).';
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (url.protocol === 'https:') return null;
  if (url.protocol === 'http:' && local && !production) return null;
  return 'The address must start with https://';
}

export function normaliseHost(raw: string): string {
  return new URL(raw).origin;
}

const clinicFields = z.object({
  name: z.string().trim().min(2, 'Enter the clinic name.').max(160),
  mcsLabCode: z
    .string()
    .trim()
    .min(2, 'Enter the lab code agreed with MyClinicSoft.')
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, dashes and underscores only.'),
  platformHost: z.string().trim().min(1, 'Enter the clinic’s MyClinicSoft address.').max(200),
  mcsTenantId: z.string().trim().max(40).optional().transform((v) => v || undefined),
  contactName: z.string().trim().max(120).optional().transform((v) => v || undefined),
  contactPhone: z.string().trim().max(40).optional().transform((v) => v || undefined),
});

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0])] ??= issue.message;
  return out;
}

function parseClinic(input: unknown): Result<{ data: z.infer<typeof clinicFields> }> {
  const parsed = clinicFields.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const hostProblem = platformHostProblem(parsed.data.platformHost);
  if (hostProblem) return { ok: false, fieldErrors: { platformHost: hostProblem } };
  return { ok: true, data: { ...parsed.data, platformHost: normaliseHost(parsed.data.platformHost) } };
}

export async function createClinic(
  actor: SessionUser,
  input: unknown,
  ip?: string
): Promise<Result<{ clinicId: string; apiKey: string; webhookSecret: string }>> {
  const parsed = parseClinic(input);
  if (!parsed.ok) return parsed;
  await connectDB();
  const key = newApiKey();
  const webhookSecret = newWebhookSecret();
  const clinic = await ConnectedClinic.create({
    ...parsed.data,
    labId: actor.labId,
    apiKeys: [{ prefix: key.prefix, hash: key.hash, createdAt: new Date() }],
    webhookSecretEnc: encryptSecret(webhookSecret),
  });
  await audit({ action: 'clinic.connected', labId: actor.labId, userId: actor.id, entity: 'ConnectedClinic', entityId: clinic._id, after: parsed.data, ip });
  return { ok: true, clinicId: String(clinic._id), apiKey: key.key, webhookSecret };
}

export async function updateClinic(actor: SessionUser, clinicId: string, input: unknown, ip?: string): Promise<Result> {
  const parsed = parseClinic(input);
  if (!parsed.ok) return parsed;
  await connectDB();
  const before = await ConnectedClinic.findOne({ _id: clinicId, labId: actor.labId }).select('name mcsLabCode platformHost mcsTenantId contactName contactPhone').lean();
  if (!before) return { ok: false, error: 'That clinic is no longer connected.' };
  await ConnectedClinic.updateOne({ _id: clinicId }, { $set: parsed.data });
  await audit({ action: 'clinic.updated', labId: actor.labId, userId: actor.id, entity: 'ConnectedClinic', entityId: clinicId, before, after: parsed.data, ip });
  return { ok: true };
}

/** A new key; keys in use keep working for 7 more days so the clinic can switch without a gap. */
export async function rotateApiKey(actor: SessionUser, clinicId: string, now = new Date(), ip?: string): Promise<Result<{ apiKey: string; oldKeysUntil: Date }>> {
  await connectDB();
  const clinic = await ConnectedClinic.findOne({ _id: clinicId, labId: actor.labId });
  if (!clinic) return { ok: false, error: 'That clinic is no longer connected.' };
  const until = new Date(now.getTime() + KEY_OVERLAP_MS);
  for (const k of clinic.apiKeys) {
    if (!k.expiresAt || k.expiresAt > until) k.expiresAt = until;
  }
  // Drop keys that have already run out.
  clinic.apiKeys = clinic.apiKeys.filter((k) => !k.expiresAt || k.expiresAt > now) as typeof clinic.apiKeys;
  const key = newApiKey();
  clinic.apiKeys.push({ prefix: key.prefix, hash: key.hash, createdAt: now });
  await clinic.save();
  await audit({ action: 'clinic.api-key-rotated', labId: actor.labId, userId: actor.id, entity: 'ConnectedClinic', entityId: clinicId, after: { newPrefix: key.prefix, oldKeysUntil: until }, ip });
  return { ok: true, apiKey: key.key, oldKeysUntil: until };
}

/** A new webhook secret, in force at once: MyClinicSoft must be given it straight away. */
export async function rotateWebhookSecret(actor: SessionUser, clinicId: string, ip?: string): Promise<Result<{ webhookSecret: string }>> {
  await connectDB();
  const secret = newWebhookSecret();
  const result = await ConnectedClinic.updateOne({ _id: clinicId, labId: actor.labId }, { $set: { webhookSecretEnc: encryptSecret(secret) } });
  if (!result.matchedCount) return { ok: false, error: 'That clinic is no longer connected.' };
  await audit({ action: 'clinic.webhook-secret-rotated', labId: actor.labId, userId: actor.id, entity: 'ConnectedClinic', entityId: clinicId, ip });
  return { ok: true, webhookSecret: secret };
}

export async function setClinicActive(actor: SessionUser, clinicId: string, active: boolean, ip?: string): Promise<Result> {
  await connectDB();
  const result = await ConnectedClinic.updateOne({ _id: clinicId, labId: actor.labId }, { $set: { active } });
  if (!result.matchedCount) return { ok: false, error: 'That clinic is no longer connected.' };
  await audit({ action: active ? 'clinic.switched-on' : 'clinic.switched-off', labId: actor.labId, userId: actor.id, entity: 'ConnectedClinic', entityId: clinicId, ip });
  return { ok: true };
}

export type ClinicAuth =
  | { ok: true; clinic: ConnectedClinicDoc }
  | { ok: false; code: 'UNAUTHORIZED' | 'CLINIC_INACTIVE' };

/** Check an API key from `Authorization: Bearer`. Expired keys and unknown keys are refused alike. */
export async function authenticateClinic(rawKey: string | null | undefined, now = new Date()): Promise<ClinicAuth> {
  const match = rawKey?.match(/^lpk_([A-Za-z0-9]{8})_[A-Za-z0-9_-]{20,64}$/);
  if (!rawKey || !match) return { ok: false, code: 'UNAUTHORIZED' };
  await connectDB();
  const clinic = await ConnectedClinic.findOne({ 'apiKeys.prefix': match[1] }).lean<ConnectedClinicDoc>();
  if (!clinic) return { ok: false, code: 'UNAUTHORIZED' };
  const hash = sha256(rawKey);
  const key = clinic.apiKeys.find((k) => k.prefix === match[1] && safeEqual(k.hash, hash));
  if (!key || (key.expiresAt && key.expiresAt <= now)) return { ok: false, code: 'UNAUTHORIZED' };
  if (!clinic.active) return { ok: false, code: 'CLINIC_INACTIVE' };
  // Note use at most once a minute, so a busy clinic doesn't write on every order.
  if (!key.lastUsedAt || now.getTime() - key.lastUsedAt.getTime() > 60_000) {
    await ConnectedClinic.updateOne({ _id: clinic._id, 'apiKeys.prefix': key.prefix }, { $set: { 'apiKeys.$.lastUsedAt': now } });
  }
  return { ok: true, clinic };
}

export function clinicWebhookSecret(clinic: Pick<ConnectedClinicDoc, 'webhookSecretEnc'>): string {
  return decryptSecret(clinic.webhookSecretEnc);
}

/** The LAB_INTEGRATIONS entry MyClinicSoft support pastes in (lib/lab-integration.ts there). */
export function integrationEntry(input: {
  labCode: string;
  labName: string;
  appUrl: string;
  apiKey: string;
  webhookSecret: string;
  tenantId?: string;
}) {
  return {
    labCode: input.labCode,
    labName: input.labName,
    apiEndpoint: `${input.appUrl.replace(/\/$/, '')}/v1/orders`,
    apiKey: input.apiKey,
    webhookSecret: input.webhookSecret,
    ...(input.tenantId ? { tenantIds: [input.tenantId] } : {}),
  };
}
