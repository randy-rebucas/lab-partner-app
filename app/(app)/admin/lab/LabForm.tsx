'use client';

import { useFormAction } from '@/components/ui/useFormAction';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { StatusLine } from '@/components/ui/StatusLine';
import { saveLabAction } from '../actions';

type LabValues = { name: string; licenceNo: string; address: string; phone: string; email: string; reportHeader: string };

export function LabForm({ lab }: { lab: LabValues }) {
  const [state, onSubmit, pending] = useFormAction(saveLabAction);
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {state?.ok && state.message && <StatusLine tone="success">{state.message}</StatusLine>}
      {state && !state.ok && state.error && <StatusLine tone="error">{state.error}</StatusLine>}
      <Field id="name" label="Lab name" error={fe.name}>
        <Input id="name" defaultValue={lab.name} required error={fe.name} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="licenceNo" label="DOH licence number" error={fe.licenceNo}>
          <Input id="licenceNo" defaultValue={lab.licenceNo} className="font-mono" error={fe.licenceNo} />
        </Field>
        <Field id="phone" label="Phone" error={fe.phone}>
          <Input id="phone" type="tel" defaultValue={lab.phone} error={fe.phone} />
        </Field>
      </div>
      <Field id="email" label="Email" error={fe.email}>
        <Input id="email" type="email" defaultValue={lab.email} error={fe.email} />
      </Field>
      <Field id="address" label="Address" error={fe.address}>
        <Textarea id="address" rows={2} defaultValue={lab.address} error={fe.address} />
      </Field>
      <Field id="reportHeader" label="Extra lines on reports" hint="For example accreditation numbers or opening hours. Printed under the lab name." error={fe.reportHeader}>
        <Textarea id="reportHeader" rows={2} defaultValue={lab.reportHeader} error={fe.reportHeader} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save lab profile'}
        </Button>
      </div>
    </form>
  );
}
