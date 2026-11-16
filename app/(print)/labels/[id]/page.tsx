import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { requireUser } from '@/lib/auth/guards';
import { CAN } from '@/lib/auth/roles';
import { ageText } from '@/lib/time';
import { Order } from '@/models/Order';
import { Specimen } from '@/models/Specimen';
import { LabelSheet } from './LabelSheet';

export const metadata = { title: 'Specimen label' };

/** Black-on-white 50 × 25 mm Code 128 labels for one specimen (FR-5). */
export default async function LabelPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string; copies?: string }> }) {
  const me = await requireUser([...CAN.seeSpecimens, ...CAN.checkIn]);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!Types.ObjectId.isValid(id)) notFound();
  await connectDB();
  const s = await Specimen.findOne({ _id: id, labId: me.labId }).lean();
  if (!s) notFound();
  const o = await Order.findById(s.orderId).select('patient test').lean();
  const p = o?.patient;
  const copies = Math.min(6, Math.max(1, Number(sp.copies) || 1));
  const collected = new Date(s.collectedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return (
    <LabelSheet
      autoPrint={sp.print === '1'}
      copies={copies}
      label={{
        accessionNo: s.accessionNo,
        name: `${p?.lastName ?? ''}, ${p?.firstName ?? ''}`.toUpperCase(),
        detail: [p?.dateOfBirth, ageText(p?.dateOfBirth), p?.sex === 'male' ? 'M' : p?.sex === 'female' ? 'F' : null].filter(Boolean).join(' · '),
        test: `${o?.test?.labCode ?? ''} · ${s.container}`,
        collected,
        rejected: s.status === 'rejected',
      }}
    />
  );
}
