import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { requireUser } from '@/lib/auth/guards';
import { Tags } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Mono, PageHeader, Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { ConnectedClinic } from '@/models/ConnectedClinic';
import { TestMapping } from '@/models/TestMapping';
import { StatusLine } from '@/components/ui/StatusLine';
import { CredentialActions, EditClinicForm } from '../ClinicForms';

export const metadata = { title: 'Clinic' };

const when = (d: Date) =>
  d.toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export default async function ClinicPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser(['admin']);
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();
  await connectDB();
  const clinic = await ConnectedClinic.findOne({ _id: id, labId: me.labId }).lean();
  if (!clinic) notFound();
  const names = await TestMapping.countDocuments({ clinicId: id });
  const now = new Date();
  const keys = clinic.apiKeys.filter((k) => !k.expiresAt || k.expiresAt > now).sort((a, b) => +b.createdAt - +a.createdAt);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {clinic.name}
            {clinic.active ? <Badge tone="emerald">Connected</Badge> : <Badge tone="gray">Switched off</Badge>}
          </span>
        }
        subtitle={
          <>
            Results go to <Mono>{clinic.platformHost}</Mono> as lab <Mono>{clinic.mcsLabCode}</Mono>
          </>
        }
        actions={
          <ButtonLink href={`/admin/clinics/${id}/mappings`} variant="secondary">
            <Tags className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Test names <span className="font-mono tabular-nums text-gray-500">{names}</span>
          </ButtonLink>
        }
      />
      {names === 0 && (
        <StatusLine tone="warning">
          This clinic has no test names yet, so every order it sends is refused as an unknown test. Open Test names to add them.
        </StatusLine>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel>
          <PanelHeader title="Details" />
          <PanelBody>
            <EditClinicForm
              clinicId={id}
              values={{
                name: clinic.name,
                mcsLabCode: clinic.mcsLabCode,
                platformHost: clinic.platformHost,
                mcsTenantId: clinic.mcsTenantId ?? '',
                contactName: clinic.contactName ?? '',
                contactPhone: clinic.contactPhone ?? '',
              }}
            />
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Credentials" subtitle="Keys are stored only as hashes. A lost key can't be shown again; make a new one." />
          <PanelBody className="space-y-5">
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {keys.map((k) => (
                <li key={k.prefix} className="space-y-0.5 px-4 py-3 text-sm">
                  <p className="flex items-center justify-between gap-2">
                    <Mono className="text-gray-900">lpk_{k.prefix}_…</Mono>
                    {k.expiresAt ? <Badge tone="amber">Old key</Badge> : <Badge tone="emerald">Current</Badge>}
                  </p>
                  <p className="text-xs text-gray-500">
                    Made <Mono>{when(k.createdAt)}</Mono>
                    {k.lastUsedAt && (
                      <>
                        {' '}
                        · last used <Mono>{when(k.lastUsedAt)}</Mono>
                      </>
                    )}
                  </p>
                  {k.expiresAt && (
                    <p className="text-xs text-amber-800">
                      Stops working <Mono>{when(k.expiresAt)}</Mono>
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <CredentialActions clinicId={id} active={clinic.active} />
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}
