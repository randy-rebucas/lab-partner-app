import 'server-only';
import { generateSecret, generateURI, verify } from 'otplib';
import { BRAND } from '@/lib/brand';

export function newTotpSecret(): string {
  return generateSecret();
}

export function totpUri(secret: string, email: string): string {
  return generateURI({ issuer: BRAND.appName, label: email, secret });
}

/** Normalise what was typed: digits only, so "123 456" works. */
export function cleanCode(code: string): string {
  return code.replace(/\D/g, '');
}

/** True for a valid 6-digit code, allowing one 30-second step of clock drift either way. */
export async function checkTotp(secret: string, code: string): Promise<boolean> {
  const token = cleanCode(code);
  if (token.length !== 6) return false;
  try {
    const result = await verify({ secret, token, epochTolerance: 30 });
    return result.valid;
  } catch {
    return false;
  }
}
