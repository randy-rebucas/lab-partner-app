import { createHmac } from 'node:crypto';

/** `sha256=<hex>` over "<timestamp>.<raw body>", as MyClinicSoft verifies (contract §2). */
export function signBody(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex')}`;
}
