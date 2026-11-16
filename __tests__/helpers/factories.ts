import { encryptSecret } from '@/lib/crypto';
import { hashPassword } from '@/lib/auth/password';
import { newTotpSecret } from '@/lib/auth/totp';
import { Lab } from '@/models/Lab';
import { User } from '@/models/User';

export const TEST_PASSWORD = 'correct horse battery staple';

export async function makeLab(name = 'Test Diagnostic Lab') {
  return Lab.create({ name });
}

/** A user with a known password and (by default) an enrolled authenticator. */
export async function makeUser(
  labId: unknown,
  overrides: Partial<{ email: string; roles: string[]; active: boolean; totp: boolean; name: string; licenceNo: string }> = {}
) {
  const totpSecret = overrides.totp === false ? null : newTotpSecret();
  const user = await User.create({
    labId,
    name: overrides.name ?? 'Maria Santos',
    email: overrides.email ?? 'maria@lab.test',
    passwordHash: await hashPassword(TEST_PASSWORD),
    roles: overrides.roles ?? ['medtech'],
    active: overrides.active ?? true,
    licenceNo: overrides.licenceNo,
    totpSecretEnc: totpSecret ? encryptSecret(totpSecret) : undefined,
  });
  return { user, totpSecret };
}
