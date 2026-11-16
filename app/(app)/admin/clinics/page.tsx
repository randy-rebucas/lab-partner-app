import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { connectDB } from '@/lib/db';
import { requireUser } from '@/lib/auth/guards';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, Mono, PageHeader, Panel } from '@/components/ui/Panel';
import { ConnectedClinic } from '@/models/ConnectedClinic';
import { AddClinicButton } from './ClinicForms';

export const metadata = { title: 'Connected clinics' };

export default async function ClinicsPage() {
  const me = await requireUser(['admin']);
  await connectDB();
  const clinics = await ConnectedClinic.find({ labId: me.labId }).select('name platformHost mcsLabCode active apiKeys').sort({ active: -1, name: 1 }).lean();
  const now = new Date();
  return (
    <>
      <PageHeader
        title="Connected clinics"
        subtitle={`${clinics.filter((c) => c.active).length} clinics can send orders. Each has its own API key and webhook secret.`}
        actions={<AddClinicButton />}
      />
      <Panel className="overflow-hidden">
        {clinics.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-5 w-5" strokeWidth={1.75} />}
            title="No clinics connected yet"
            hint="Connect a MyClinicSoft clinic to start receiving its lab orders."
          />
        ) : (
          <ul className="divide-y divide-gray-100">
            {clinics.map((c) => {
              const lastUsed = c.apiKeys.map((k) => k.lastUsedAt).filter(Boolean).sort().at(-1);
              const rotating = c.apiKeys.some((k) => k.expiresAt && k.expiresAt > now);
              return (
                <li key={String(c._id)}>
                  <Link
                    href={`/admin/clinics/${c._id}`}
                    className="grid grid-cols-1 gap-1 px-5 py-3.5 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_auto] md:items-center md:gap-4"
                  >
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-semibold ${c.active ? 'text-gray-900' : 'text-gray-600'}`}>{c.name}</p>
                      <p className="text-xs text-gray-500">
                        Lab code <Mono>{c.mcsLabCode}</Mono>
                      </p>
                    </div>
                    <Mono className="truncate text-sm text-gray-600">{c.platformHost}</Mono>
                    <p className="text-sm text-gray-600">
                      {lastUsed ? (
                        <>
                          Last order <Mono>{new Date(lastUsed).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' })}</Mono>
                        </>
                      ) : (
                        'No orders yet'
                      )}
                    </p>
                    <div className="flex gap-2">
                      {rotating && <Badge tone="amber">Key changing</Badge>}
                      {c.active ? <Badge tone="emerald">Connected</Badge> : <Badge tone="gray">Switched off</Badge>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
