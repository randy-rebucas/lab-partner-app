import 'server-only';
import bcrypt from 'bcryptjs';

const COST = 12;
export const MIN_PASSWORD_LENGTH = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** A reason the password is not acceptable, in words, or null when it is fine. */
export function passwordProblem(plain: string, email?: string): string | null {
  if (plain.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (plain.length > 200) return 'Use 200 characters or fewer.';
  if (email && plain.toLowerCase().includes(email.split('@')[0].toLowerCase())) return "Don't include your email name in the password.";
  if (/^(.)\1+$/.test(plain)) return "Don't repeat one character.";
  return null;
}

// A hash of a random password, compared against when no account matches, so a missing account
// takes as long to refuse as a wrong password.
let dummyHash: Promise<string> | null = null;
export function dummyPasswordCheck(plain: string): Promise<boolean> {
  dummyHash ??= bcrypt.hash('no-account-matches-this-password', COST);
  return dummyHash.then((h) => bcrypt.compare(plain, h)).then(() => false);
}
