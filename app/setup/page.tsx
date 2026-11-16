import { redirect } from 'next/navigation';
import BrandLogo from '@/components/BrandLogo';
import { AuthPhoto } from '@/components/AuthPhoto';
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
    <main className="grid min-h-screen bg-gray-50 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      {/* The form is long; the photo stays in view while it scrolls. */}
      <div className="relative hidden lg:block">
        <div className="sticky top-0 h-screen">
          <AuthPhoto
            name="setup"
            title="Your lab, connected in minutes."
            body="Set up the lab and its first admin here. Then add your tests and connect the clinics that send you orders."
          />
        </div>
      </div>
      <div className="flex flex-col items-center px-4 py-12">
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
      </div>
    </main>
  );
}
