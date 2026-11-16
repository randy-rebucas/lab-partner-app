import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth/guards';
import { desktopSummary } from '@/lib/desktop-summary';

// GET /api/desktop/summary — badge counts and alert items for the desktop app, for whoever is
// signed in. Read-only; 401 when signed out, which the app shows as "sign in".
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json(await desktopSummary(user), { headers: { 'Cache-Control': 'no-store' } });
}
