/**
 * Add one person to an existing lab, with a one-time password.
 *
 *   pnpm create-user -- --email test.medtech@yourlab.ph --name "Test Medtech" --roles medtech
 *   pnpm create-user -- --email path@yourlab.ph --name "Dr. Test Signatory" --roles signatory,medtech --licence PRC-0000000
 *
 * Roles: admin, front-desk, phlebotomist, medtech, signatory. A signatory needs --licence.
 * The person must change the password and set up an authenticator at first sign-in.
 * Refuses if the email already exists. Prints the database host it wrote to, so you can confirm it.
 */
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { audit } from '@/lib/audit';
import { connectDB } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { ROLES, type Role } from '@/lib/auth/roles';
import { Lab } from '@/models/Lab';
import { User } from '@/models/User';

function stop(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== '--'),
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      roles: { type: 'string' },
      licence: { type: 'string' },
    },
  });
  const email = values.email?.trim().toLowerCase();
  const name = values.name?.trim();
  const roles = (values.roles ?? '').split(',').map((r) => r.trim()).filter(Boolean);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) stop('Give a valid --email.');
  if (!name || name.length < 2) stop('Give the person’s --name.');
  const unknown = roles.filter((r) => !(ROLES as readonly string[]).includes(r));
  if (!roles.length || unknown.length) stop(`Give --roles from: ${ROLES.join(', ')}${unknown.length ? ` (unknown: ${unknown.join(', ')})` : ''}`);
  if (roles.includes('signatory') && !values.licence?.trim()) stop('A signatory needs --licence (printed on reports).');

  const uri = process.env.MONGODB_URI;
  if (!uri) stop('MONGODB_URI is not set.');
  await connectDB();
  const host = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, 'http://')).host;

  const labs = await Lab.find().select('name').lean();
  if (labs.length !== 1) stop(labs.length ? 'More than one lab in this database; this script expects one.' : 'No lab yet. Run pnpm seed first.');
  const lab = labs[0];
  if (await User.exists({ labId: lab._id, email })) stop(`${email} already exists in ${lab.name}. Nothing changed.`);

  const password = randomBytes(12).toString('base64url');
  const user = await User.create({
    labId: lab._id,
    name,
    email,
    passwordHash: await hashPassword(password),
    roles: roles as Role[],
    licenceNo: values.licence?.trim() || undefined,
    mustChangePassword: true,
  });
  await audit({ action: 'user.created', labId: lab._id, actor: 'create-user script', entity: 'User', entityId: user._id, after: { email, roles } });

  console.log(`Database: ${host}`);
  console.log(`Lab:      ${lab.name}`);
  console.log(`Created ${email} (${roles.join(', ')})`);
  console.log(`One-time password: ${password}`);
  console.log('They choose their own password and set up an authenticator at first sign-in.');
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
