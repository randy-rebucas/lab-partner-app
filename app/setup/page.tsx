import { redirect } from 'next/navigation';
import BrandLogo from '@/components/BrandLogo';
import { BRAND } from '@/lib/brand';
import { needsSetup, setupTokenRequired } from '@/lib/setup';
import { SetupForm } from './SetupForm';

export const metadata = { title: 'Set up your lab' };
export const dynamic = 'force-dynamic';

/** First-time setup: shown only while the database has no lab. */
export default async function SetupPage() {
  if (!(await needsSetup())) redirect('/login');
  const tokenRequired = setupTokenRequired();
  const tokenMissing = tokenRequired && !process.env.SETUP_TOKEN;
  return (
    <main className="flex min-h-screen flex-col items-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="mb-8 flex items-center justify-center gap-3">
          <BrandLogo size={40} />
          <div className="leading-tight">
            <p className="text-lg font-bold tracking-tight text-gray-900">{BRAND.wordmark}</p>
            <p className="text-sm text-gray-500">{BRAND.product}</p>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 sm:p-8">
          <h1 className="text-xl font-extrabold tracking-tight text-gray-900">Set up your lab</h1>
          <p className="mt-1 text-sm text-gray-600">
            This server has no lab yet. Enter your lab’s details and create the first admin account. You’ll set up an authenticator app next.
          </p>
          <div className="mt-6">
            <SetupForm tokenRequired={tokenRequired} tokenMissing={tokenMissing} />
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-gray-500">This page closes for good once the lab is set up.</p>
      </div>
    </main>
  );
}
