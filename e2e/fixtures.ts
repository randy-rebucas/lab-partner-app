/**
 * Test users for the end-to-end scripts: one per role, with a known password and authenticator key.
 * Refuses to run unless MONGODB_URI points at a local database.
 *
 *   pnpm e2e:fixtures
 */
import mongoose from 'mongoose';
import { encryptSecret } from '@/lib/crypto';
import { hashPassword } from '@/lib/auth/password';
import type { Role } from '@/lib/auth/roles';
import { Lab } from '@/models/Lab';
import { User } from '@/models/User';
import { E2E_PASSWORD, E2E_TOTP_SECRET, E2E_USERS } from './users';

async function main() {
  const uri = process.env.MONGODB_URI ?? '';
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(uri)) {
    console.error('Refusing: e2e fixtures only run against a local database.');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const lab = (await Lab.findOne()) ?? (await Lab.create({ name: 'Sample Diagnostic Laboratory' }));
  const passwordHash = await hashPassword(E2E_PASSWORD);
  for (const u of E2E_USERS) {
    await User.updateOne(
      { labId: lab._id, email: u.email },
      {
        $set: {
          name: u.name,
          roles: u.roles as Role[],
          licenceNo: u.licenceNo,
          passwordHash,
          totpSecretEnc: encryptSecret(E2E_TOTP_SECRET),
          active: true,
          mustChangePassword: false,
          failedLogins: 0,
        },
        $unset: { lockedUntil: 1, totpLastCode: 1, totpLastAt: 1, totpPendingSecretEnc: 1 },
      },
      { upsert: true }
    );
    console.log(`  ${u.email} (${u.roles.join(', ')})`);
  }
  console.log(`\nPassword for all: ${E2E_PASSWORD}`);
  console.log(`Authenticator key for all: ${E2E_TOTP_SECRET}`);
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
