import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { VerifyCodeForm } from '../forms';

export const metadata = { title: 'Enter your code' };

export default async function VerifyPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.stage === 'full') redirect('/');
  if (!session.user.totpEnabled) redirect('/login/setup');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-gray-900">Enter your code</h1>
        <p className="mt-1 text-sm text-gray-600">
          Open your authenticator app and enter the 6-digit code for <span className="font-medium text-gray-900">{session.user.email}</span>.
        </p>
      </div>
      <VerifyCodeForm />
      <p className="text-sm text-gray-600">
        Lost your phone? Ask your lab admin to reset your authenticator. <Link href="/login" className="font-semibold text-brand-teal-dark hover:underline">Start over</Link>
      </p>
    </div>
  );
}
