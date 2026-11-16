import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { needsSetup } from '@/lib/setup';
import { SignInForm } from './forms';

export const metadata = { title: 'Sign in' };

export default async function LoginPage() {
  // A fresh install has no lab and no one to sign in as: set it up first.
  if (await needsSetup()) redirect('/setup');
  const session = await getSession();
  if (session?.stage === 'full') redirect('/');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-gray-900">Sign in</h1>
        <p className="mt-1 text-sm text-gray-600">Use the email your lab admin set up for you.</p>
      </div>
      <SignInForm />
    </div>
  );
}
