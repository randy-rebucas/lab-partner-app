import { connectDB } from '@/lib/db';
import { requireUser } from '@/lib/auth/guards';
import { PageHeader, Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { Lab } from '@/models/Lab';
import { LabForm } from './LabForm';

export const metadata = { title: 'Lab profile' };

export default async function LabProfilePage() {
  const user = await requireUser(['admin']);
  await connectDB();
  const lab = await Lab.findById(user.labId).lean();
  return (
    <>
      <PageHeader title="Lab profile" subtitle="Printed at the top of every result report and sent with results to clinics." />
      <Panel className="max-w-3xl">
        <PanelHeader title="Details" />
        <PanelBody>
          <LabForm
            lab={{
              name: lab?.name ?? '',
              licenceNo: lab?.licenceNo ?? '',
              address: lab?.address ?? '',
              phone: lab?.phone ?? '',
              email: lab?.email ?? '',
              reportHeader: lab?.reportHeader ?? '',
            }}
          />
        </PanelBody>
      </Panel>
    </>
  );
}
