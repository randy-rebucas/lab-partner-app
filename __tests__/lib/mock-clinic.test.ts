import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { judgeWebhook, verifySignature, type SentOrder } from '../../scripts/mock-clinic/verify';

// The mock clinic must judge results exactly as MyClinicSoft does, or later end-to-end checks of
// delivery prove nothing.

const SECRET = 'whsec_test';
const NOW = Date.UTC(2026, 10, 16, 1, 0, 0);
const ts = String(Math.floor(NOW / 1000));
const sign = (body: string, t = ts, secret = SECRET) => `sha256=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

const body = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ requestId: 'ord_1', requestCode: 'LR-1', resultId: 'A1-v1', testType: 'CBC', results: { hb: 13 }, ...over });

function judge(raw: string, headers: Partial<{ labCode: string | null; signature: string | null; timestamp: string | null }> = {}, sent?: SentOrder[]) {
  return judgeWebhook({
    rawBody: raw,
    headers: { labCode: 'sample-lab', signature: sign(raw), timestamp: ts, ...headers },
    expectedLabCode: 'sample-lab',
    secret: SECRET,
    sent: sent ?? [{ requestCode: 'LR-1', requestId: 'ord_1', testType: 'CBC', resultIds: [] }],
    nowMs: NOW,
  });
}

describe('mock clinic webhook checks', () => {
  it('applies a correctly signed result, then treats the same resultId as a duplicate', () => {
    const sent: SentOrder[] = [{ requestCode: 'LR-1', requestId: 'ord_1', testType: 'CBC', resultIds: [] }];
    expect(judge(body(), {}, sent)).toMatchObject({ status: 200, applied: true });
    expect(judge(body(), {}, sent)).toMatchObject({ status: 200, body: { data: { duplicate: true } } });
    expect(judge(body({ resultId: 'A1-v2' }), {}, sent)).toMatchObject({ status: 200, applied: true });
  });

  it('refuses a bad signature, a stale timestamp, a wrong lab code', () => {
    const raw = body();
    expect(judge(raw, { signature: sign(raw, ts, 'other') }).status).toBe(401);
    expect(judge(raw + ' ', { signature: sign(raw) }).status).toBe(401);
    const old = String(Number(ts) - 301);
    expect(judge(raw, { timestamp: old, signature: sign(raw, old) }).status).toBe(401);
    const edge = String(Number(ts) - 300);
    expect(judge(raw, { timestamp: edge, signature: sign(raw, edge) }).status).toBe(200);
    expect(judge(raw, { timestamp: null }).status).toBe(401);
    expect(judge(raw, { labCode: 'other-lab' }).status).toBe(401);
    expect(verifySignature(raw, { signature: `sha1=${sign(raw).slice(7)}`, timestamp: ts }, SECRET, NOW)).toBe(false);
  });

  it('answers 400, 404 and 409 as MyClinicSoft does', () => {
    expect(judge(body({ results: undefined })).status).toBe(400);
    expect(judge(body({ requestId: 'ord_unknown' })).status).toBe(404);
    expect(judge(body({ requestCode: 'LR-other' })).status).toBe(404);
    const twice: SentOrder[] = [
      { requestCode: 'LR-1', requestId: 'ord_1', testType: 'CBC', resultIds: [] },
      { requestCode: 'LR-2', requestId: 'ord_1', testType: 'CBC', resultIds: [] },
    ];
    expect(judge(body({ requestCode: undefined }), {}, twice).status).toBe(409);
    expect(judge(body(), {}, twice).status).toBe(200);
  });

  it('answers 503 when the clinic has no secret configured', () => {
    expect(judgeWebhook({ rawBody: body(), headers: { labCode: 'sample-lab', signature: null, timestamp: null }, expectedLabCode: 'sample-lab', secret: undefined, sent: [] }).status).toBe(503);
  });
});
