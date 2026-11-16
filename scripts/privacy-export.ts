/**
 * Everything this lab holds about one patient of one clinic, as JSON (Data Privacy Act access request).
 *
 *   pnpm privacy:export -- --clinic "Reyes Family Clinic" --patient-code P-01234 [--out export.json]
 *   pnpm privacy:export -- --clinic <id> --name "Reyes, Ana" --dob 2019-04-02
 *
 * Attachment files are listed by name; open them in the app if the request needs them.
 */
import { writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { audit } from '@/lib/audit';
import { Delivery } from '@/models/Delivery';
import { Result } from '@/models/Result';
import { Specimen } from '@/models/Specimen';
import { args, findOrders } from './privacy-lib';

async function main() {
  const v = args();
  const { clinic, orders } = await findOrders(v);
  const ids = orders.map((o) => o._id);
  const [specimens, results, deliveries] = await Promise.all([
    Specimen.find({ orderId: { $in: ids } }).lean(),
    Result.find({ orderId: { $in: ids } }).sort({ version: 1 }).lean(),
    Delivery.find({ orderId: { $in: ids } }).select('-body').lean(),
  ]);
  const doc = {
    exportedAt: new Date().toISOString(),
    clinic: clinic.name,
    orders: orders.map((o) => ({
      requestCode: o.requestCode,
      labOrderId: o.requestId,
      receivedAt: o.receivedAt,
      status: o.status,
      urgency: o.urgency,
      patient: o.patient,
      test: { name: o.test?.labName, sentAs: o.test?.type },
      clinicalInfo: o.clinicalInfo,
      instructions: o.instructions,
      checkIn: o.checkIn,
      history: o.statusHistory.map((h) => ({ status: h.status, at: h.at, by: h.by, note: h.note })),
      specimens: specimens
        .filter((s) => String(s.orderId) === String(o._id))
        .map((s) => ({ accessionNo: s.accessionNo, container: s.container, collectedAt: s.collectedAt, collectedBy: s.collectedBy, condition: s.condition, status: s.status, rejectedReason: s.rejectedReason })),
      results: results
        .filter((r) => String(r.orderId) === String(o._id))
        .map((r) => ({
          version: r.version,
          status: r.status,
          values: r.values,
          interpretation: r.interpretation,
          enteredBy: r.enteredBy,
          releasedBy: r.releasedBy,
          releasedAt: r.releasedAt,
          reportSerial: r.reportSerial,
          amendReason: r.amendReason,
          attachments: r.attachments.map((a) => a.name),
          deliveries: deliveries.filter((d) => String(d.resultId) === String(r._id)).map((d) => ({ resultId: d.resultIdString, deliveredAt: d.deliveredAt, flagged: d.flagged })),
        })),
    })),
  };
  const json = JSON.stringify(doc, null, 2);
  if (v.out) {
    writeFileSync(v.out, json);
    console.error(`Wrote ${orders.length} orders to ${v.out}`);
  } else {
    process.stdout.write(json + '\n');
  }
  await audit({ action: 'privacy.exported', labId: clinic.labId, actor: 'privacy-export script', entity: 'ConnectedClinic', entityId: clinic._id, after: { orders: orders.length } });
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
