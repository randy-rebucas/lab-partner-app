import Link from 'next/link';
import { FlaskConical, Plus } from 'lucide-react';
import { connectDB } from '@/lib/db';
import { requireUser } from '@/lib/auth/guards';
import { SECTIONS } from '@/lib/catalog/names';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, Mono, PageHeader, Panel, PanelHeader } from '@/components/ui/Panel';
import { StatusLine } from '@/components/ui/StatusLine';
import { TestDefinition } from '@/models/TestDefinition';
import { AddSampleTestsButton } from './CatalogButtons';

export const metadata = { title: 'Test catalog' };

export default async function CatalogPage() {
  const me = await requireUser(['admin']);
  await connectDB();
  const tests = await TestDefinition.find({ labId: me.labId })
    .select('code name section specimenType turnaroundHours analytes.key active sample')
    .sort({ name: 1 })
    .lean();
  const sampleCount = tests.filter((t) => t.sample).length;
  const sections = SECTIONS.map((s) => ({ section: s, tests: tests.filter((t) => t.section === s) })).filter((g) => g.tests.length);

  return (
    <>
      <PageHeader
        title="Test catalog"
        subtitle={`${tests.filter((t) => t.active).length} tests clinics can order. Each clinic’s names for them are set on its page under Connected clinics.`}
        actions={
          <ButtonLink href="/admin/catalog/new">
            <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Add a test
          </ButtonLink>
        }
      />
      {sampleCount > 0 && (
        <StatusLine tone="warning">
          {sampleCount === 1 ? '1 test has' : `${sampleCount} tests have`} sample reference ranges. Check each one against your analyser and reagents, then
          tick “Ranges checked” on the test, before releasing results.
        </StatusLine>
      )}
      {tests.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<FlaskConical className="h-5 w-5" strokeWidth={1.75} />}
            title="No tests yet"
            hint="Add your tests one by one, or start from five common ones (CBC, urinalysis, FBS, lipid profile, creatinine) and adjust their ranges."
            action={<AddSampleTestsButton />}
          />
        </Panel>
      ) : (
        sections.map(({ section, tests }) => (
          <Panel key={section} className="overflow-hidden">
            <PanelHeader title={section} subtitle={`${tests.length} ${tests.length === 1 ? 'test' : 'tests'}`} />
            <ul className="divide-y divide-gray-100">
              {tests.map((t) => (
                <li key={String(t._id)}>
                  <Link
                    href={`/admin/catalog/${t._id}`}
                    className="grid grid-cols-1 gap-1 px-5 py-3.5 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center md:gap-4"
                  >
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-semibold ${t.active ? 'text-gray-900' : 'text-gray-600'}`}>{t.name}</p>
                      <p className="text-xs text-gray-500">
                        <Mono>{t.code}</Mono> · {t.analytes.length} {t.analytes.length === 1 ? 'analyte' : 'analytes'}
                      </p>
                    </div>
                    <p className="truncate text-sm text-gray-600">{t.specimenType}</p>
                    <p className="text-sm text-gray-600">
                      Ready in <Mono>{t.turnaroundHours} h</Mono>
                    </p>
                    <div className="flex gap-2">
                      {t.sample && <Badge tone="amber">Sample ranges</Badge>}
                      {!t.active && <Badge tone="gray">Switched off</Badge>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        ))
      )}
    </>
  );
}
