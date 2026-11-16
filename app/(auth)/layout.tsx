import BrandLogo from '@/components/BrandLogo';
import { AuthPhoto } from '@/components/AuthPhoto';
import { BRAND } from '@/lib/brand';

/** Sign-in and its follow-up steps: the form on the right, the lab's world on the left (large screens). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <AuthPhoto
        name="sign-in"
        title="From specimen to signed results."
        body="Orders arrive from MyClinicSoft clinics, results go back to the ordering doctor, signed and on time."
      />
      <div className="flex flex-col items-center justify-center bg-gray-50 px-4 py-12 lg:bg-white">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-center gap-3 lg:justify-start">
            <BrandLogo size={40} />
            <div className="leading-tight">
              <p className="text-lg font-bold tracking-tight text-gray-900">{BRAND.wordmark}</p>
              <p className="text-sm text-gray-500">{BRAND.product}</p>
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-6 sm:p-8 lg:border-0 lg:p-0">{children}</div>
          <p className="mt-6 text-center text-xs text-gray-500 lg:text-left">Staff only. Every sign-in is recorded.</p>
        </div>
      </div>
    </main>
  );
}
