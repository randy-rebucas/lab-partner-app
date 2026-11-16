/**
 * Delete everything this lab holds about one patient of one clinic (Data Privacy Act erasure request
 * that came through the clinic). Shows what would go; deletes only with --confirm.
 *
 *   pnpm privacy:delete -- --clinic "Reyes Family Clinic" --patient-code P-01234
 *   pnpm privacy:delete -- --clinic "Reyes Family Clinic" --patient-code P-01234 --confirm
 *
 * Check the lab's DOH record-keeping duty before confirming: results may have to be kept.
 * Audit entries stay (who did what, when) with their before/after details removed.
 */
import mongoose from 'mongoose';
import { audit } from '@/lib/audit';
import { fileStore } from '@/lib/files';
import { AuditEvent } from '@/models/AuditEvent';
import { Delivery } from '@/models/Delivery';
import { Order } from '@/models/Order';
import { Result } from '@/models/Result';
import { Specimen } from '@/models/Specimen';
import { args, findOrders } from './privacy-lib';

async function main() {
  const v = args();
  const { clinic, orders } = await findOrders(v);
  const ids = orders.map((o) => o._id);
  const [specimens, results, deliveries] = await Promise.all([
    Specimen.find({ orderId: { $in: ids } }).select('_id accessionNo').lean(),
    Result.find({ orderId: { $in: ids } }).select('_id attachments').lean(),
    Delivery.find({ orderId: { $in: ids } }).select('_id').lean(),
  ]);
  const files = [...new Set(results.flatMap((r) => r.attachments.map((a) => a.fileId)))];
  console.log(`${clinic.name}: ${orders.length} orders, ${specimens.length} specimens, ${results.length} result versions, ${files.length} files, ${deliveries.length} deliveries.`);
  for (const o of orders) console.log(`  ${o.requestCode}  ${o.patient?.lastName}, ${o.patient?.firstName}  ${o.test?.labName}  ${o.status}`);
  if (!orders.length) {
    await mongoose.disconnect();
    return;
  }
  if (!v.confirm) {
    console.log('\nNothing deleted. Run again with --confirm to delete these records for good.');
    await mongoose.disconnect();
    return;
  }
  for (const f of files) await fileStore.delete(f);
  const entityIds = [...ids, ...specimens.map((s) => s._id), ...results.map((r) => r._id), ...deliveries.map((d) => d._id)].map(String);
  await AuditEvent.updateMany({ entityId: { $in: [...entityIds, ...orders.map((o) => o.requestId)] } }, { $unset: { before: 1, after: 1 } });
  await Delivery.deleteMany({ orderId: { $in: ids } });
  await Result.deleteMany({ orderId: { $in: ids } });
  await Specimen.deleteMany({ orderId: { $in: ids } });
  await Order.deleteMany({ _id: { $in: ids } });
  await audit({
    action: 'privacy.deleted',
    labId: clinic.labId,
    actor: 'privacy-delete script',
    entity: 'ConnectedClinic',
    entityId: clinic._id,
    after: { orders: orders.length, requestCodes: orders.map((o) => o.requestCode) },
  });
  console.log('\nDeleted.');
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
