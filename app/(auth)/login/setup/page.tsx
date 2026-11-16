import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { getSession } from '@/lib/auth/session';
import { pendingTotpSecret, startTotpEnrolment } from '@/lib/auth/sign-in';
import { totpUri } from '@/lib/auth/totp';
import { ConfirmSetupForm } from '../forms';

export const metadata = { title: 'Set up your authenticator' };

export default async function SetupPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.stage === 'full') redirect('/');
  if (session.user.totpEnabled) redirect('/login/verify');

  // Keep the same secret across reloads until it is confirmed.
  const secret = (await pendingTotpSecret(session.user.id)) ?? (await startTotpEnrolment(session.user.id));
  const qr = await QRCode.toDataURL(totpUri(secret, session.user.email), { margin: 1, width: 192, color: { dark: '#0f172a', light: '#ffffff' } });
  const grouped = secret.match(/.{1,4}/g)?.join(' ') ?? secret;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-gray-900">Set up your authenticator</h1>
        <p className="mt-1 text-sm text-gray-600">
          Every sign-in needs a code from an authenticator app, such as Google Authenticator or Microsoft Authenticator.
        </p>
      </div>
      <ol className="space-y-4 text-sm text-gray-900">
        <li>
          <p className="font-semibold">1. Scan this code with the app</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URL, not an optimisable image */}
          <img src={qr} alt="QR code to add this account to your authenticator app" width={192} height={192} className="mt-3 rounded-md border border-gray-200" />
          <p className="mt-3 text-gray-600">Can&apos;t scan? Type this key into the app instead:</p>
          <p className="mt-1 select-all break-all rounded-md bg-gray-50 px-3 py-2 font-mono text-sm tracking-wider text-gray-900">{grouped}</p>
        </li>
        <li>
          <p className="font-semibold">2. Enter the code the app shows</p>
        </li>
      </ol>
      <ConfirmSetupForm />
    </div>
  );
}
