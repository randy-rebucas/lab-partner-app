import 'server-only';
import { redirect } from 'next/navigation';
import { getSession } from './session';
import { hasAnyRole, type Role } from './roles';
import type { SessionUser } from './session-store';

/**
 * The signed-in user, or a redirect. Use at the top of every page and server action.
 * - no session, or one still waiting for its code → sign-in
 * - signed in but without one of `roles` → the no-access page
 */
export async function requireUser(roles?: readonly Role[]): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.stage !== 'full') redirect(session.user.totpEnabled ? '/login/verify' : '/login/setup');
  if (session.user.mustChangePassword) redirect('/login/password');
  if (roles && roles.length && !hasAnyRole(session.user.roles, roles)) redirect('/no-access');
  return session.user;
}

/** For server actions that return a result instead of redirecting. */
export async function currentUser(roles?: readonly Role[]): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session || session.stage !== 'full' || session.user.mustChangePassword) return null;
  if (roles && roles.length && !hasAnyRole(session.user.roles, roles)) return null;
  return session.user;
}
