import { NextResponse } from 'next/server';

// Liveness only: no auth, no data, no database call.
export function GET() {
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
