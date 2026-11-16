import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { requireUser } from '@/lib/auth/guards';
import { Badge } from '@/components/ui/Badge';
import { Mono, PageHeader } from '@/components/ui/Panel';
import { StatusLine } from '@/components/ui/StatusLine';
import { TestDefinition } from '@/models/TestDefinition';
import { TestMapping } from '@/models/TestMapping';
import { TestActiveToggle } from '../CatalogButtons';
import { TestEditor } from '../TestEditor';

export const metadata = { title: 'Test' };

export default async function TestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const me = await requireUser(['admin']);
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  if (!Types.ObjectId.isValid(id)) notFound();
  await connectDB();
  const [t, clinicNames] = await Promise.all([
    TestDefinition.findOne({ _id: id, labId: me.labId }).lean(),
    TestMapping.countDocuments({ labId: me.labId, testId: id }),
  ]);
  if (!t) notFound();

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {t.name}
            {t.sample && <Badge tone="amber">Sample ranges</Badge>}
            {!t.active && <Badge tone="gray">Switched off</Badge>}
          </span>
        }
        subtitle={
          <>
            <Mono>{t.code}</Mono> · {clinicNames === 0 ? 'no clinic has a name for it yet' : `${clinicNames} clinic ${clinicNames === 1 ? 'name points' : 'names point'} here`}
          </>
        }
        actions={<TestActiveToggle testId={id} active={t.active} name={t.name} />}
      />
      {created && <StatusLine tone="success">Test added. Give it a name on each clinic’s page so the clinic can order it.</StatusLine>}
      {t.sample && (
        <StatusLine tone="warning">
          These are sample ranges, not your analyser’s. Change them to your own, tick “Ranges checked”, and save.
        </StatusLine>
      )}
      <TestEditor
        testId={id}
        values={{
          code: t.code,
          loinc: t.loinc ?? '',
          name: t.name,
          section: t.section,
          specimenType: t.specimenType,
          turnaroundHours: t.turnaroundHours,
          aliases: t.aliases,
          active: t.active,
          sample: t.sample,
          analytes: t.analytes.map((a) => ({
            key: a.key,
            name: a.name,
            unit: a.unit,
            kind: a.kind,
            criticalLow: a.criticalLow,
            criticalHigh: a.criticalHigh,
            ranges: a.ranges.map((r) => ({ sex: r.sex, ageMinDays: r.ageMinDays, ageMaxDays: r.ageMaxDays, low: r.low, high: r.high, text: r.text })),
          })),
        }}
      />
    </>
  );
}
