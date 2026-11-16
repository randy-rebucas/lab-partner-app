import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { requireUser } from '@/lib/auth/guards';
import { PageHeader } from '@/components/ui/Panel';
import { ConnectedClinic } from '@/models/ConnectedClinic';
import { IntakeRefusal } from '@/models/IntakeRefusal';
import { TestDefinition } from '@/models/TestDefinition';
import { TestMapping } from '@/models/TestMapping';
import { MappingsClient } from './MappingsClient';

export const metadata = { title: 'Test names' };

export default async function MappingsPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser(['admin']);
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();
  await connectDB();
  const clinic = await ConnectedClinic.findOne({ _id: id, labId: me.labId }).select('name').lean();
  if (!clinic) notFound();
  const [mappings, tests, refused] = await Promise.all([
    TestMapping.find({ clinicId: id }).sort({ clinicTestTypeKey: 1, clinicTestCodeKey: 1 }).lean(),
    TestDefinition.find({ labId: me.labId }).select('code name active').sort({ name: 1 }).lean(),
    IntakeRefusal.find({ clinicId: id }).sort({ lastAt: -1 }).limit(20).lean(),
  ]);
  const testById = new Map(tests.map((t) => [String(t._id), t]));

  return (
    <>
      <PageHeader
        title="Test names"
        subtitle={
          <>
            What{' '}
            <Link href={`/admin/clinics/${id}`} className="font-semibold text-brand-teal-dark underline-offset-2 hover:underline">
              {clinic.name}
            </Link>{' '}
            calls each test. An order whose test name or code isn’t here is refused as an unknown test.
          </>
        }
      />
      <MappingsClient
        clinicId={id}
        refused={refused.map((r) => ({ id: String(r._id), testType: r.testType ?? '', testCode: r.testCode ?? '', reason: r.reason, count: r.count, lastAt: r.lastAt.toISOString() }))}
        tests={tests.map((t) => ({ id: String(t._id), code: t.code, name: t.name, active: t.active }))}
        mappings={mappings.map((m) => {
          const t = testById.get(String(m.testId));
          return {
            id: String(m._id),
            clinicTestType: m.clinicTestType ?? '',
            clinicTestCode: m.clinicTestCode ?? '',
            testName: t?.name ?? 'Removed test',
            testCode: t?.code ?? '',
            testActive: t?.active ?? false,
          };
        })}
      />
    </>
  );
}
