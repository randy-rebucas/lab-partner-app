import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { createSession, deleteSession, findSession, type ActiveSession, type SessionStage } from './session-store';

export const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || 'lp_session';

/** The current request's session (once per request). */
export const getSession = cache(async (): Promise<ActiveSession | null> => {
  const jar = await cookies();
  return findSession(jar.get(SESSION_COOKIE)?.value);
});

/** Start a session and set its cookie. Only callable from a server action or route handler. */
export async function startSession(input: {
  userId: string;
  labId: string;
  stage: SessionStage;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  const { token, expiresAt } = await createSession(input);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

/** End the current session and clear its cookie. */
export async function endSession(): Promise<void> {
  const jar = await cookies();
  await deleteSession(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
}
