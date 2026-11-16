import { requireUser } from '@/lib/auth/guards';
import { PageHeader } from '@/components/ui/Panel';
import { TestEditor } from '../TestEditor';

export const metadata = { title: 'Add a test' };

export default async function NewTestPage() {
  await requireUser(['admin']);
  return (
    <>
      <PageHeader title="Add a test" subtitle="Clinics can order it once it has a name for them on the clinic’s page." />
      <TestEditor
        testId={null}
        values={{ code: '', loinc: '', name: '', section: '', specimenType: '', turnaroundHours: null, aliases: [], active: true, sample: false, analytes: [] }}
      />
    </>
  );
}
