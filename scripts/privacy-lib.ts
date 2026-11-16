import { parseArgs } from 'node:util';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { ConnectedClinic } from '@/models/ConnectedClinic';
import { Order } from '@/models/Order';

// Shared by privacy-export and privacy-delete: find one patient's orders at one clinic.
// Patients are never matched across clinics (each clinic's patient list is its own).

export function args() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== '--'),
    options: {
      clinic: { type: 'string' },
      'patient-code': { type: 'string' },
      name: { type: 'string' },
      dob: { type: 'string' },
      out: { type: 'string' },
      confirm: { type: 'boolean', default: false },
    },
  });
  if (!values.clinic || (!values['patient-code'] && !(values.name && values.dob))) {
    console.error(
      [
        'Name the clinic and the patient:',
        '  --clinic "Reyes Family Clinic"  (or its id)',
        '  --patient-code P-01234          (the clinic’s patient code), or',
        '  --name "Reyes, Ana" --dob 2019-04-02',
      ].join('\n')
    );
    process.exit(1);
  }
  return values;
}

export async function findOrders(v: ReturnType<typeof args>) {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  await connectDB();
  const clinics = await ConnectedClinic.find(Types.ObjectId.isValid(v.clinic!) ? { _id: v.clinic } : { name: v.clinic }).select('name labId').lean();
  if (clinics.length !== 1) {
    console.error(clinics.length ? 'More than one clinic has that name; use its id.' : 'No clinic with that name or id.');
    process.exit(1);
  }
  const clinic = clinics[0];
  const filter: Record<string, unknown> = { clinicId: clinic._id };
  if (v['patient-code']) filter['patient.patientCode'] = v['patient-code'];
  else {
    const [last, first] = v.name!.split(',').map((s) => s.trim());
    if (!last || !first) {
      console.error('Give the name as "Last, First".');
      process.exit(1);
    }
    const exact = (s: string) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    Object.assign(filter, { 'patient.lastName': exact(last), 'patient.firstName': exact(first), 'patient.dateOfBirth': v.dob });
  }
  const orders = await Order.find(filter).lean();
  return { clinic, orders };
}
