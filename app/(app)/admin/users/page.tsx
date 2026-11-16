import { connectDB } from '@/lib/db';
import { requireUser } from '@/lib/auth/guards';
import { userState } from '@/lib/users';
import { User } from '@/models/User';
import { UsersClient, type UserRow } from './UsersClient';

export const metadata = { title: 'Users' };

export default async function UsersPage() {
  const me = await requireUser(['admin']);
  await connectDB();
  const users = await User.find({ labId: me.labId })
    .select('name email roles licenceNo active lockedUntil totpSecretEnc lastLoginAt')
    .sort({ active: -1, name: 1 })
    .lean();
  const now = new Date();
  const rows: UserRow[] = users.map((u) => ({
    id: String(u._id),
    name: u.name,
    email: u.email,
    roles: [...u.roles],
    licenceNo: u.licenceNo ?? '',
    state: userState(u, now),
    lockedUntil: u.lockedUntil ? u.lockedUntil.toISOString() : null,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    isMe: String(u._id) === me.id,
  }));
  const canSignIn = rows.filter((r) => r.state === 'can-sign-in').length;
  return <UsersClient rows={rows} subtitle={`${canSignIn} of ${rows.length} can sign in. Every account needs an authenticator app.`} />;
}
