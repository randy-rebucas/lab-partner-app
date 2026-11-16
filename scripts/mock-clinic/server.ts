/**
 * Mock clinic: stands in for a clinic's MyClinicSoft during development.   pnpm mock:clinic
 *
 *   POST /api/lab-results/third-party/webhook   results from the lab, checked as MyClinicSoft does
 *   GET  /mock/received                          every webhook so far, with the answer given
 *   GET  /mock/sent                              orders sent with pnpm mock:order
 *   POST /mock/fail   {"status":503,"times":2}   answer the next N webhooks with that status
 *   POST /mock/fail   {"status":null}            back to normal
 *
 * MOCK_FAIL=500 (or 401, 503…) makes every webhook fail. Listens on 127.0.0.1:4010 (MOCK_PORT).
 * Uses the connection in e2e/.out/clinic.json (see state.ts).
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { connection, logReceived, readReceived, readSent, writeSent } from './state';
import { judgeWebhook } from './verify';

const PORT = Number(process.env.MOCK_PORT || 4010);
const conn = connection();
let failNext: { status: number; times: number } | null = process.env.MOCK_FAIL ? { status: Number(process.env.MOCK_FAIL), times: Infinity } : null;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) req.destroy(new Error('too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const time = () => new Date().toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour12: false });

async function webhook(req: IncomingMessage, res: ServerResponse) {
  const rawBody = await readBody(req);
  const headers = {
    labCode: (req.headers['x-lab-code'] as string) ?? null,
    signature: (req.headers['x-webhook-signature'] as string) ?? null,
    timestamp: (req.headers['x-webhook-timestamp'] as string) ?? null,
  };
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    parsed = rawBody.slice(0, 500);
  }

  if (failNext && failNext.times > 0) {
    failNext.times -= 1;
    const status = failNext.status;
    if (failNext.times <= 0) failNext = null;
    logReceived({ at: new Date().toISOString(), status, applied: false, headers, body: parsed });
    console.log(`${time()}  webhook → ${status} (told to fail)`);
    return send(res, status, { success: false, error: `Mock clinic told to answer ${status}` });
  }

  const sent = readSent();
  const verdict = judgeWebhook({ rawBody, headers, expectedLabCode: conn.labCode, secret: conn.webhookSecret, sent });
  if (verdict.applied) writeSent(sent);
  logReceived({ at: new Date().toISOString(), status: verdict.status, applied: !!verdict.applied, headers, body: parsed });

  const b = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
  const what = verdict.applied ? 'applied' : verdict.status === 200 ? 'duplicate' : String(verdict.body.error);
  console.log(`${time()}  webhook ${b.requestCode ?? '?'} ${b.resultId ?? ''} → ${verdict.status} ${what}`);
  if (verdict.applied) {
    const flags = (b.abnormalFlags ?? {}) as Record<string, string>;
    for (const [k, v] of Object.entries((b.results ?? {}) as Record<string, unknown>)) {
      console.log(`          ${k.padEnd(14)} ${String(v).padEnd(10)} ${flags[k] && flags[k] !== 'normal' ? flags[k].toUpperCase() : ''}`);
    }
    if (b.interpretation) console.log(`          ${b.interpretation}`);
  }
  send(res, verdict.status, verdict.body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    if (req.method === 'POST' && url.pathname === '/api/lab-results/third-party/webhook') return await webhook(req, res);
    if (req.method === 'GET' && url.pathname === '/mock/received') return send(res, 200, readReceived());
    if (req.method === 'GET' && url.pathname === '/mock/sent') return send(res, 200, readSent());
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });
    if (req.method === 'POST' && url.pathname === '/mock/fail') {
      const { status, times } = JSON.parse((await readBody(req)) || '{}');
      failNext = status ? { status: Number(status), times: Number(times ?? 1) } : null;
      console.log(`${time()}  ${failNext ? `next ${failNext.times} webhooks answer ${failNext.status}` : 'webhooks back to normal'}`);
      return send(res, 200, { failNext });
    }
    send(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    send(res, 500, { error: 'Mock clinic failed' });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock clinic “${conn.clinicName ?? 'clinic'}” on http://127.0.0.1:${PORT}`);
  console.log(`  receives results for lab code ${conn.labCode}; sends orders to ${conn.apiEndpoint}`);
  if (failNext) console.log(`  MOCK_FAIL=${failNext.status}: every webhook fails`);
});
