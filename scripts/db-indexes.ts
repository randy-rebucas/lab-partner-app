/**
 * Show, and with --apply create or drop, the indexes each model declares.
 *
 *   pnpm db:indexes            what would change
 *   pnpm db:indexes -- --apply make the change
 *
 * Run with --apply before each production deploy that adds a model or index; production does not
 * build indexes on start (lib/db.ts sets autoIndex off there).
 */
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import '@/models/AuditEvent';
import '@/models/ConnectedClinic';
import '@/models/Counter';
import '@/models/Delivery';
import '@/models/IntakeRefusal';
import '@/models/Lab';
import '@/models/Order';
import '@/models/RateWindow';
import '@/models/Result';
import '@/models/Session';
import '@/models/Specimen';
import '@/models/TestDefinition';
import '@/models/TestMapping';
import '@/models/User';

async function main() {
  const apply = process.argv.includes('--apply');
  await connectDB();
  let changes = 0;
  for (const model of Object.values(mongoose.models)) {
    await model.createCollection().catch(() => undefined);
    const diff = await model.diffIndexes();
    const toCreate = diff.toCreate.map((i) => JSON.stringify(i));
    const toDrop = diff.toDrop.map((i) => (typeof i === 'string' ? i : JSON.stringify(i)));
    if (!toCreate.length && !toDrop.length) continue;
    changes += toCreate.length + toDrop.length;
    console.log(`${model.modelName}`);
    toCreate.forEach((i) => console.log(`  + ${i}`));
    toDrop.forEach((i) => console.log(`  - ${i}`));
    if (apply) await model.syncIndexes();
  }
  if (!changes) console.log('Indexes match the models.');
  else console.log(apply ? '\nApplied.' : '\nNothing changed. Run with --apply to make these changes.');
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
