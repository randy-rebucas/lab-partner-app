import { NextResponse, type NextRequest } from 'next/server';
import { safeEqual } from '@/lib/crypto';
import { runDueDeliveries } from '@/lib/delivery/run';

// The delivery safety net: run every minute by Vercel Cron (GET) or a system cron (POST), with
// `Authorization: Bearer $CRON_SECRET`. Sends whatever is due; releases also send at once via after().

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!secret || !given || !safeEqual(given, secret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const summary = await runDueDeliveries();
  return NextResponse.json(summary, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = handle;
export const POST = handle;
