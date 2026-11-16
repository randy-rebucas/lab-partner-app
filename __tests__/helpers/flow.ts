import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { makeLab, makeUser } from './factories';
import { toSessionUser, type SessionUser } from '@/lib/auth/session-store';
import { addCommonNames } from '@/lib/catalog/mappings';
import { addSampleTests } from '@/lib/catalog/tests';
import { createClinic } from '@/lib/clinics';
import { receiveOrder } from '@/lib/orders/intake';
import { checkIn, collectSpecimen } from '@/lib/specimens';
import { manilaInputValue } from '@/lib/specimen-options';
import { judgeWebhook, type SentOrder } from '../../scripts/mock-clinic/verify';
import { Order } from '@/models/Order';

/**
 * A fake clinic platform on 127.0.0.1 that judges webhooks exactly as MyClinicSoft does.
 * `failWith` makes it answer that status instead (until cleared).
 */
export async function startClinicServer() {
  const state = { sent: [] as SentOrder[], received: [] as { status: number; body: unknown }[], failWith: null as number | null, secret: '', labCode: 'sample-lab' };
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const status = state.failWith;
      const verdict =
        status !== null
          ? { status, body: { success: false } }
          : judgeWebhook({
              rawBody: raw,
              headers: {
                labCode: (req.headers['x-lab-code'] as string) ?? null,
                signature: (req.headers['x-webhook-signature'] as string) ?? null,
                timestamp: (req.headers['x-webhook-timestamp'] as string) ?? null,
              },
              expectedLabCode: state.labCode,
              secret: state.secret,
              sent: state.sent,
            });
      state.received.push({ status: verdict.status, body: JSON.parse(raw || 'null') });
      res.writeHead(verdict.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(verdict.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { state, url, close: () => new Promise<void>((r) => server.close(() => r())) };
}

/** A lab with a medtech, two signatories, an admin, the sample catalog and one connected clinic. */
export async function setupLab(platformHost = 'https://reyes.test') {
  const lab = await makeLab();
  const user = async (email: string, roles: string[], name: string, licenceNo?: string) => toSessionUser((await makeUser(lab._id, { email, roles, name, licenceNo })).user);
  const admin = await user('admin@lab.test', ['admin', 'phlebotomist'], 'Andrea Admin');
  const medtech = await user('medtech@lab.test', ['medtech'], 'Mara Santos', 'RMT-1');
  const path = await user('path@lab.test', ['signatory', 'medtech'], 'Dr. Patricia Lim', 'PRC-9');
  const path2 = await user('path2@lab.test', ['signatory'], 'Dr. Ramon Uy', 'PRC-7');
  await addSampleTests(String(lab._id), admin);
  const clinic = await createClinic(admin, { name: 'Reyes Family Clinic', mcsLabCode: 'sample-lab', platformHost });
  if (!clinic.ok) throw new Error('clinic setup failed');
  await addCommonNames(admin, clinic.clinicId);
  let n = 0;

  /** An order from the clinic, checked in and collected; ready for results. */
  async function collectedOrder(test = 'CBC', patient: Record<string, unknown> = {}): Promise<{ orderId: string; requestId: string; requestCode: string }> {
    n += 1;
    const requestCode = `LR-${n}`;
    const r = await receiveOrder({
      authorization: `Bearer ${(clinic as { apiKey: string }).apiKey}`,
      rawBody: JSON.stringify({
        request: { requestCode, patient: { firstName: 'Ana', lastName: 'Reyes', dateOfBirth: '1990-04-02', gender: 'female', ...patient }, test: { type: test, urgency: 'routine' } },
      }),
    });
    const requestId = (r.body as { requestId: string }).requestId;
    const orderId = String((await Order.findOne({ requestId }).lean())!._id);
    await checkIn(admin, orderId, { idType: 'Passport', nameMatches: true, birthDateMatches: true });
    const c = await collectSpecimen(admin, orderId, { container: 'Lavender top (EDTA)', collectedAt: manilaInputValue(new Date(Date.now() - 5 * 60_000)), condition: 'Good' });
    if (!c.ok) throw new Error(`collect failed ${JSON.stringify(c)}`);
    return { orderId, requestId, requestCode };
  }

  return { labId: String(lab._id), admin, medtech, path, path2, clinic: clinic as { clinicId: string; apiKey: string; webhookSecret: string }, collectedOrder };
}

export const CBC_NORMAL = { hb: '13.2', hct: '40', rbc: '4.6', wbc: '6.5', plt: '250', neut: '55', lymph: '35', mono: '5', eos: '3', baso: '0.5' };

export type Actors = { medtech: SessionUser; path: SessionUser; path2: SessionUser };
