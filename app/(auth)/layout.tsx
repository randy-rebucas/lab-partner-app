import BrandLogo from '@/components/BrandLogo';
import { BRAND } from '@/lib/brand';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-3">
          <BrandLogo size={40} />
          <div className="leading-tight">
            <p className="text-lg font-bold tracking-tight text-gray-900">{BRAND.wordmark}</p>
            <p className="text-sm text-gray-500">{BRAND.product}</p>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 sm:p-8">{children}</div>
        <p className="mt-6 text-center text-xs text-gray-500">Staff only. Every sign-in is recorded.</p>
      </div>
    </main>
  );
}
