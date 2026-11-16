import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { ChangePasswordForm } from '../forms';

export const metadata = { title: 'Choose a new password' };

export default async function ChangePasswordPage() {
  const session = await getSession();
  if (!session || session.stage !== 'full') redirect('/login');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-gray-900">Choose a new password</h1>
        <p className="mt-1 text-sm text-gray-600">
          {session.user.mustChangePassword
            ? 'Your password was set by your lab admin. Choose your own before you continue.'
            : 'Signing in with the new password ends your sessions on other devices.'}
        </p>
      </div>
      <ChangePasswordForm />
    </div>
  );
}
