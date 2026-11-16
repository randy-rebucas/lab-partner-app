/**
 * First-run setup: the lab record, its first admin, and a sample test catalog (marked as sample data).
 *
 *   pnpm seed -- --email admin@yourlab.ph --name "Juan Dela Cruz" --lab "Your Diagnostic Lab"
 *
 * Prints a one-time password. The admin must change it, and set up an authenticator, at first sign-in.
 * Safe to run again: an existing lab or user is left as it is.
 */
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { connectDB } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { addSampleTests } from '@/lib/catalog/tests';
import { Lab } from '@/models/Lab';
import { User } from '@/models/User';

async function main() {
  const { values } = parseArgs({
    // pnpm passes the "--" separator through; ignore it.
    args: process.argv.slice(2).filter((a) => a !== '--'),
    options: {
      email: { type: 'string' },
      name: { type: 'string', default: 'Lab Admin' },
      lab: { type: 'string', default: 'Sample Diagnostic Laboratory' },
    },
  });
  const email = values.email?.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    console.error('Give the first admin\'s email: pnpm seed -- --email admin@yourlab.ph');
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set (put it in .env.local)');
  await connectDB();

  let lab = await Lab.findOne();
  if (!lab) {
    lab = await Lab.create({ name: values.lab });
    console.log(`Created lab: ${lab.name}`);
    const added = await addSampleTests(String(lab._id));
    console.log(`Added ${added} sample tests. Check their reference ranges before releasing results.`);
  } else {
    console.log(`Lab already set up: ${lab.name}`);
  }

  const existing = await User.findOne({ labId: lab._id, email });
  if (existing) {
    console.log(`User ${email} already exists. Nothing changed.`);
  } else {
    const password = randomBytes(12).toString('base64url');
    await User.create({
      labId: lab._id,
      name: values.name,
      email,
      passwordHash: await hashPassword(password),
      roles: ['admin'],
      mustChangePassword: true,
    });
    console.log(`\nCreated admin ${email}`);
    console.log(`One-time password: ${password}`);
    console.log('Sign in at /login. You will set up an authenticator app and choose your own password.\n');
  }
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
