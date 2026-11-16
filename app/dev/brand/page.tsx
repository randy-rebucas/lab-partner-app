import { notFound } from 'next/navigation';
import { FlaskConical, Inbox } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { EmptyState, Mono, PageHeader, Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { StatusLine } from '@/components/ui/StatusLine';
import { OrderStatusBadge, UrgencyBadge } from '@/components/OrderStatusBadge';
import { ResultValue } from '@/components/ResultValue';
import { ORDER_STATUSES } from '@/lib/orders/status';
import { BRAND } from '@/lib/brand';
import { DialogDemo } from './DialogDemo';

export const metadata = { title: 'Brand check' };

/** Development-only page: every primitive in one place, to check the look against MyClinicSoft. */
export default function BrandPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <PageHeader
        title="Brand check"
        subtitle="Every shared component, rendered with the MyClinicSoft tokens."
        actions={
          <>
            <Button variant="secondary">Secondary</Button>
            <Button>Release results</Button>
          </>
        }
      />

      <StatusLine tone="success">Results for LR-000481 sent to Reyes Family Clinic at 9:41 AM.</StatusLine>
      <StatusLine tone="warning">Delivery to Reyes Family Clinic failed twice. Next try at 10:15 AM.</StatusLine>
      <StatusLine tone="error">Release refused: record the call to the clinic for the critical value first.</StatusLine>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Logo and type" subtitle="Geist Sans for words, Geist Mono for figures" />
          <PanelBody className="space-y-4">
            <div className="flex items-center gap-3">
              <BrandLogo size={32} />
              <div className="leading-tight">
                <p className="font-bold tracking-tight text-gray-900">{BRAND.wordmark}</p>
                <p className="text-xs text-gray-500">{BRAND.product}</p>
              </div>
            </div>
            <p className="text-3xl font-extrabold tracking-tight text-gray-900">Page title 800</p>
            <p className="text-base font-bold tracking-tight text-gray-900">Panel title 700</p>
            <p className="text-sm text-gray-900">Body text in Geist Sans at 0.875rem.</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Sidebar group label</p>
            <p className="text-3xl font-semibold">
              <Mono>1,284</Mono>
            </p>
            <p className="text-sm">
              Accession <Mono>261116-0042</Mono> · collected <Mono>9:41 AM</Mono>
            </p>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Buttons and dialog" />
          <PanelBody className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button disabled>Disabled</Button>
            <DialogDemo />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Order statuses" subtitle="Colour always comes with a word" />
          <PanelBody className="flex flex-wrap gap-2">
            {ORDER_STATUSES.map((s) => (
              <OrderStatusBadge key={s} status={s} />
            ))}
            <UrgencyBadge urgency="stat" />
            <UrgencyBadge urgency="urgent" />
            <UrgencyBadge urgency="routine" />
            <Badge tone="outline">
              <s>v1</s> Replaced by v2
            </Badge>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Result flags" />
          <PanelBody>
            <ul className="divide-y divide-gray-100 text-sm">
              <li className="flex justify-between py-2">
                Haemoglobin <ResultValue value="13.2" unit="g/dL" />
              </li>
              <li className="flex justify-between py-2">
                White cells <ResultValue value="11.8" unit="×10⁹/L" flag="high" />
              </li>
              <li className="flex justify-between py-2">
                Platelets <ResultValue value="140" unit="×10⁹/L" flag="low" />
              </li>
              <li className="flex justify-between bg-red-50 px-2 py-2">
                Potassium <ResultValue value="6.8" unit="mmol/L" flag="critical-high" />
              </li>
            </ul>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Fields" />
          <PanelBody className="space-y-4">
            <Field id="demo-accession" label="Accession number" hint="Scan the barcode or type it.">
              <Input id="demo-accession" hasHint placeholder="261116-0042" className="font-mono" />
            </Field>
            <Field id="demo-reason" label="Reason" error="Choose why the specimen was rejected.">
              <Select id="demo-reason" error="Choose why the specimen was rejected." defaultValue="">
                <option value="">Choose…</option>
                <option>Haemolysed</option>
                <option>Wrong container</option>
              </Select>
            </Field>
          </PanelBody>
        </Panel>

        <Panel>
          <EmptyState
            icon={<Inbox className="h-5 w-5" strokeWidth={1.75} />}
            title="No orders waiting"
            hint="Orders from connected clinics appear here as they arrive."
            action={
              <Button variant="secondary" size="sm">
                <FlaskConical className="h-4 w-4" strokeWidth={1.75} /> Connect a clinic
              </Button>
            }
          />
        </Panel>
      </div>
    </main>
  );
}
