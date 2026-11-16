import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import type { SentOrder } from './verify';

// The mock clinic's memory, as files so send-order and the server share it, and e2e scripts can
// read it: e2e/.out/mock-clinic/{sent.json, received.jsonl}.

export const DIR = process.env.MOCK_DIR || path.join('e2e', '.out', 'mock-clinic');
const SENT = path.join(DIR, 'sent.json');
const RECEIVED = path.join(DIR, 'received.jsonl');

/** The connection entry the lab showed when the clinic was connected (written by pnpm e2e:clinics). */
export type Connection = { labCode: string; labName?: string; apiEndpoint: string; apiKey: string; webhookSecret: string; clinicName?: string };

export function connection(): Connection {
  const file = process.env.MOCK_CONNECTION || path.join('e2e', '.out', 'clinic.json');
  const fromFile: Partial<Connection> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const c = {
    labCode: process.env.MOCK_LAB_CODE || fromFile.labCode || '',
    labName: fromFile.labName,
    apiEndpoint: process.env.MOCK_API_ENDPOINT || fromFile.apiEndpoint || 'http://localhost:3100/v1/orders',
    apiKey: process.env.MOCK_API_KEY || fromFile.apiKey || '',
    webhookSecret: process.env.MOCK_WEBHOOK_SECRET || fromFile.webhookSecret || '',
    clinicName: fromFile.clinicName,
  };
  if (!c.apiKey || !c.labCode) {
    console.error(`No connection details. Connect a clinic in the lab app (pnpm e2e:clinics writes ${file}), or set MOCK_API_KEY and MOCK_LAB_CODE.`);
    process.exit(1);
  }
  return c;
}

export function readSent(): SentOrder[] {
  return existsSync(SENT) ? JSON.parse(readFileSync(SENT, 'utf8')) : [];
}

export function writeSent(sent: SentOrder[]) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(SENT, JSON.stringify(sent, null, 2));
}

export function rememberSent(order: Omit<SentOrder, 'resultIds'>) {
  const sent = readSent().filter((o) => o.requestCode !== order.requestCode);
  sent.push({ ...order, resultIds: [] });
  writeSent(sent);
}

export type ReceivedEntry = { at: string; status: number; applied: boolean; headers: Record<string, string | null>; body: unknown };

export function logReceived(entry: ReceivedEntry) {
  mkdirSync(DIR, { recursive: true });
  appendFileSync(RECEIVED, JSON.stringify(entry) + '\n');
}

export function readReceived(): ReceivedEntry[] {
  if (!existsSync(RECEIVED)) return [];
  return readFileSync(RECEIVED, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}
