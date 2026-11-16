import { createHmac, timingSafeEqual } from 'node:crypto';

// MyClinicSoft's checks for a results webhook, copied rule for rule from
// clinic-management/lib/lab-integration.ts (verifyWebhookSignature) and
// app/api/lab-results/third-party/webhook/route.ts. Kept separate from this app's own signer on
// purpose: the mock is an independent check that the lab signs the way MyClinicSoft verifies.

export const TOLERANCE_SECONDS = 5 * 60;

export function verifySignature(
  rawBody: string,
  headers: { signature: string | null; timestamp: string | null },
  secret: string,
  nowMs = Date.now()
): boolean {
  const [algorithm, receivedHex] = (headers.signature ?? '').split('=');
  if (algorithm !== 'sha256' || !receivedHex) return false;
  if (!headers.timestamp) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isInteger(ts) || Math.abs(nowMs / 1000 - ts) > TOLERANCE_SECONDS) return false;
  const expected = createHmac('sha256', secret).update(`${headers.timestamp}.${rawBody}`, 'utf8').digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(receivedHex, 'hex'));
  } catch {
    return false;
  }
}

export type SentOrder = { requestCode: string; requestId: string; testType: string; resultIds: string[] };

export type WebhookVerdict = { status: number; body: Record<string, unknown>; applied?: boolean };

/**
 * The receiving side's decision for one webhook, given the orders this clinic sent.
 * Mirrors MyClinicSoft: 503 no secret, 401 bad lab code/signature, 400 bad body, 404 unknown
 * request, 409 ambiguous, 200 duplicate or applied.
 */
export function judgeWebhook(input: {
  rawBody: string;
  headers: { labCode: string | null; signature: string | null; timestamp: string | null };
  expectedLabCode: string;
  secret: string | undefined;
  sent: SentOrder[];
  nowMs?: number;
}): WebhookVerdict {
  if (!input.secret) return { status: 503, body: { success: false, error: 'Lab webhook is not configured' } };
  // MyClinicSoft picks the secret by X-Lab-Code; a wrong code means the wrong (or no) secret.
  if (input.headers.labCode?.trim() !== input.expectedLabCode) return { status: 401, body: { success: false, error: 'Invalid webhook signature' } };
  if (!verifySignature(input.rawBody, input.headers, input.secret, input.nowMs)) return { status: 401, body: { success: false, error: 'Invalid webhook signature' } };

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(input.rawBody);
  } catch {
    return { status: 400, body: { success: false, error: 'Invalid JSON body' } };
  }
  if (!body || typeof body.requestId !== 'string' || !body.requestId || !body.results) return { status: 400, body: { success: false, error: 'Invalid webhook payload' } };

  let matches = input.sent.filter((o) => o.requestId === body.requestId);
  if (typeof body.requestCode === 'string' && body.requestCode) matches = matches.filter((o) => o.requestCode === body.requestCode);
  if (matches.length > 1) return { status: 409, body: { success: false, error: 'Ambiguous request id; include requestCode' } };
  const order = matches[0];
  if (!order) return { status: 404, body: { success: false, error: 'Lab result not found' } };

  const resultId = body.resultId ? String(body.resultId) : null;
  if (resultId && order.resultIds.at(-1) === resultId) return { status: 200, body: { success: true, data: { requestCode: order.requestCode, status: 'received', duplicate: true } } };
  if (resultId) order.resultIds.push(resultId);
  return { status: 200, body: { success: true, data: { requestCode: order.requestCode, status: 'received' } }, applied: true };
}
