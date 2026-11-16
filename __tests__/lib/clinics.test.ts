import { describe, expect, it } from 'vitest';
import { setupTestDb } from '../helpers/db';
import { makeLab, makeUser } from '../helpers/factories';
import { toSessionUser } from '@/lib/auth/session-store';
import {
  KEY_OVERLAP_MS,
  authenticateClinic,
  clinicWebhookSecret,
  createClinic,
  integrationEntry,
  platformHostProblem,
  rotateApiKey,
  rotateWebhookSecret,
  setClinicActive,
} from '@/lib/clinics';
import { ConnectedClinic } from '@/models/ConnectedClinic';

setupTestDb();

async function setup() {
  const lab = await makeLab();
  const { user } = await makeUser(lab._id, { email: 'admin@lab.test', roles: ['admin'] });
  const actor = toSessionUser(user);
  const created = await createClinic(actor, {
    name: 'Reyes Family Clinic',
    mcsLabCode: 'sample-lab',
    platformHost: 'https://reyes.myclinicsoft.test/',
  });
  if (!created.ok) throw new Error('setup failed');
  return { actor, ...created };
}

describe('platform address rules', () => {
  it('needs https in production', () => {
    expect(platformHostProblem('https://reyes.myclinicsoft.com', true)).toBeNull();
    expect(platformHostProblem('http://reyes.myclinicsoft.com', true)).toMatch(/https/);
    expect(platformHostProblem('http://127.0.0.1:4010', true)).toMatch(/https/);
  });
  it('allows http to this machine during development only', () => {
    expect(platformHostProblem('http://127.0.0.1:4010', false)).toBeNull();
    expect(platformHostProblem('http://10.0.0.5', false)).toMatch(/https/);
  });
  it('refuses paths and credentials', () => {
    expect(platformHostProblem('https://x.test/api', true)).toMatch(/without a path/);
    expect(platformHostProblem('https://u:p@x.test', true)).toMatch(/user name/);
    expect(platformHostProblem('not a url', true)).toMatch(/full address/);
  });
});

describe('connecting a clinic', () => {
  it('stores only hashes and an encrypted secret; shows both once', async () => {
    const { clinicId, apiKey, webhookSecret } = await setup();
    expect(apiKey).toMatch(/^lpk_[A-Za-z0-9]{8}_/);
    expect(webhookSecret).toMatch(/^whsec_/);
    const raw = JSON.stringify(await ConnectedClinic.findById(clinicId).lean());
    expect(raw).not.toContain(apiKey);
    expect(raw).not.toContain(webhookSecret);
    const clinic = await ConnectedClinic.findById(clinicId).lean();
    expect(clinic?.platformHost).toBe('https://reyes.myclinicsoft.test');
    expect(clinicWebhookSecret(clinic!)).toBe(webhookSecret);
  });

  it('builds the LAB_INTEGRATIONS entry for MyClinicSoft', () => {
    expect(
      integrationEntry({ labCode: 'sample-lab', labName: 'Sample Lab', appUrl: 'https://lab.example.ph/', apiKey: 'k', webhookSecret: 's', tenantId: 't1' })
    ).toEqual({ labCode: 'sample-lab', labName: 'Sample Lab', apiEndpoint: 'https://lab.example.ph/v1/orders', apiKey: 'k', webhookSecret: 's', tenantIds: ['t1'] });
  });
});

describe('API key checks', () => {
  it('accepts the key and refuses anything else', async () => {
    const { apiKey } = await setup();
    expect((await authenticateClinic(apiKey)).ok).toBe(true);
    expect(await authenticateClinic(apiKey.slice(0, -1) + (apiKey.endsWith('A') ? 'B' : 'A'))).toEqual({ ok: false, code: 'UNAUTHORIZED' });
    expect(await authenticateClinic('Bearer nonsense')).toEqual({ ok: false, code: 'UNAUTHORIZED' });
    expect(await authenticateClinic(null)).toEqual({ ok: false, code: 'UNAUTHORIZED' });
  });

  it('says the clinic is switched off only to a valid key', async () => {
    const { actor, clinicId, apiKey } = await setup();
    await setClinicActive(actor, clinicId, false);
    expect(await authenticateClinic(apiKey)).toEqual({ ok: false, code: 'CLINIC_INACTIVE' });
  });

  it('keeps the old key working for 7 days after rotation, then refuses it', async () => {
    const { actor, clinicId, apiKey } = await setup();
    const now = new Date('2026-11-16T00:00:00Z');
    const rotated = await rotateApiKey(actor, clinicId, now);
    expect(rotated.ok).toBe(true);
    if (!rotated.ok) return;
    expect((await authenticateClinic(apiKey, new Date(now.getTime() + KEY_OVERLAP_MS - 1000))).ok).toBe(true);
    expect((await authenticateClinic(apiKey, new Date(now.getTime() + KEY_OVERLAP_MS + 1000))).ok).toBe(false);
    expect((await authenticateClinic(rotated.apiKey, new Date(now.getTime() + KEY_OVERLAP_MS + 1000))).ok).toBe(true);
  });

  it('replaces the webhook secret at once', async () => {
    const { actor, clinicId, webhookSecret } = await setup();
    const r = await rotateWebhookSecret(actor, clinicId);
    if (!r.ok) throw new Error();
    const clinic = await ConnectedClinic.findById(clinicId).lean();
    expect(clinicWebhookSecret(clinic!)).toBe(r.webhookSecret);
    expect(r.webhookSecret).not.toBe(webhookSecret);
  });
});
