import { NextResponse, type NextRequest } from 'next/server';
import { MAX_BODY_BYTES, receiveOrder } from '@/lib/orders/intake';

// POST /v1/orders: MyClinicSoft sends a lab order. Rules in lib/orders/intake.ts.

const NO_STORE = { 'Cache-Control': 'no-store' };

function reply(status: number, body: unknown, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

export async function POST(request: NextRequest) {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return reply(413, { error: { code: 'TOO_LARGE', message: 'The order is larger than 64 KB.' } });
  try {
    const result = await receiveOrder({
      authorization: request.headers.get('authorization'),
      rawBody: await request.text(),
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
    });
    return reply(result.status, result.body, result.headers);
  } catch (error) {
    console.error('Order intake failed', error);
    return reply(500, { error: { code: 'SERVER_ERROR', message: 'The lab could not take the order just now. Send it again.' } });
  }
}
