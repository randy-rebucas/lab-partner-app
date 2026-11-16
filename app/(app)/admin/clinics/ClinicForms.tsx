'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Plus } from 'lucide-react';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Field';
import { StatusLine } from '@/components/ui/StatusLine';
import { useFormAction } from '@/components/ui/useFormAction';
import { createClinicAction, credentialStepAction, updateClinicAction, type ClinicActionResult, type ConnectionDetails } from './actions';

export type ClinicValues = {
  name: string;
  mcsLabCode: string;
  platformHost: string;
  mcsTenantId: string;
  contactName: string;
  contactPhone: string;
};

const EMPTY: ClinicValues = { name: '', mcsLabCode: '', platformHost: '', mcsTenantId: '', contactName: '', contactPhone: '' };

function fe(state: ClinicActionResult | undefined) {
  return state && !state.ok ? (state.fieldErrors ?? {}) : {};
}

/** Secrets shown once, as the JSON MyClinicSoft support pastes in. */
export function ConnectionDetailsBox({ details }: { details: ConnectionDetails }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-700">
        {details.note ?? 'Send this to MyClinicSoft support as the lab’s LAB_INTEGRATIONS entry.'}{' '}
        <span className="font-semibold text-gray-900">It is shown only now.</span>
      </p>
      <pre className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs leading-relaxed text-gray-900">{details.entry}</pre>
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          navigator.clipboard.writeText(details.entry).then(
            () => setCopied(true),
            () => setCopied(false)
          )
        }
      >
        <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

function ClinicFields({ values, errors, idPrefix }: { values: ClinicValues; errors: Record<string, string>; idPrefix: string }) {
  const id = (k: string) => `${idPrefix}-${k}`;
  return (
    <div className="space-y-5">
      <Field id={id('name')} label="Clinic name" error={errors.name}>
        <Input id={id('name')} name="name" defaultValue={values.name} required error={errors.name} />
      </Field>
      <Field id={id('platformHost')} label="MyClinicSoft address" hint="Where results are sent, for example https://reyesclinic.myclinicsoft.com" error={errors.platformHost}>
        <Input id={id('platformHost')} name="platformHost" defaultValue={values.platformHost} placeholder="https://" hasHint className="font-mono" error={errors.platformHost} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id={id('mcsLabCode')} label="Lab code at MyClinicSoft" hint="Agreed with MyClinicSoft support." error={errors.mcsLabCode}>
          <Input id={id('mcsLabCode')} name="mcsLabCode" defaultValue={values.mcsLabCode} hasHint className="font-mono" error={errors.mcsLabCode} />
        </Field>
        <Field id={id('mcsTenantId')} label="Clinic ID at MyClinicSoft" hint="Optional. Limits this key to that clinic." error={errors.mcsTenantId}>
          <Input id={id('mcsTenantId')} name="mcsTenantId" defaultValue={values.mcsTenantId} hasHint className="font-mono" error={errors.mcsTenantId} />
        </Field>
        <Field id={id('contactName')} label="Contact person" error={errors.contactName}>
          <Input id={id('contactName')} name="contactName" defaultValue={values.contactName} error={errors.contactName} />
        </Field>
        <Field id={id('contactPhone')} label="Contact phone" hint="Used for critical-value calls." error={errors.contactPhone}>
          <Input id={id('contactPhone')} name="contactPhone" type="tel" defaultValue={values.contactPhone} hasHint error={errors.contactPhone} />
        </Field>
      </div>
    </div>
  );
}

export function AddClinicButton() {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button
        onClick={() => {
          setKey((k) => k + 1);
          setOpen(true);
        }}
      >
        <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        Connect a clinic
      </Button>
      <AddClinicDialog key={key} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function AddClinicDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, onSubmit, pending] = useFormAction(createClinicAction);
  const router = useRouter();
  return (
    <Dialog open={open} onClose={onClose} title="Connect a clinic" subtitle="The clinic’s MyClinicSoft sends orders here and receives signed results." wide>
      {state?.ok && state.details ? (
        <div className="space-y-4">
          <StatusLine tone="success">{state.message}</StatusLine>
          <ConnectionDetailsBox details={state.details} />
          <div className="flex justify-end">
            <Button
              onClick={() => {
                onClose();
                router.push(`/admin/clinics/${state.clinicId}`);
              }}
            >
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          {state && !state.ok && state.error && <StatusLine tone="error">{state.error}</StatusLine>}
          <ClinicFields values={EMPTY} errors={fe(state)} idPrefix="new" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Connecting…' : 'Connect clinic'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

export function EditClinicForm({ clinicId, values }: { clinicId: string; values: ClinicValues }) {
  const [state, onSubmit, pending] = useFormAction(updateClinicAction.bind(null, clinicId));
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {state?.ok && state.message && <StatusLine tone="success">{state.message}</StatusLine>}
      {state && !state.ok && state.error && <StatusLine tone="error">{state.error}</StatusLine>}
      <ClinicFields values={values} errors={fe(state)} idPrefix="edit" />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}

type Step = 'rotate-key' | 'rotate-secret' | 'switch-off' | 'switch-on';
const CONFIRM: Record<Step, { title: string; body: string; button: string; danger?: boolean }> = {
  'rotate-key': {
    title: 'Make a new API key?',
    body: 'The current key keeps working for 7 days, so MyClinicSoft can switch without missing orders.',
    button: 'Make new key',
  },
  'rotate-secret': {
    title: 'Replace the webhook secret?',
    body: 'The new secret is used at once. Results sent to this clinic are refused until MyClinicSoft has it; deliveries are retried for 24 hours. Do this only if the secret may have leaked.',
    button: 'Replace secret',
    danger: true,
  },
  'switch-off': {
    title: 'Switch off this clinic?',
    body: 'New orders from it are refused. Orders already here carry on, and their results are still delivered.',
    button: 'Switch off',
    danger: true,
  },
  'switch-on': { title: 'Switch this clinic back on?', body: 'Its orders are accepted again with its current key.', button: 'Switch on' },
};

export function CredentialActions({ clinicId, active }: { clinicId: string; active: boolean }) {
  const [confirm, setConfirm] = useState<Step | null>(null);
  const [result, setResult] = useState<ClinicActionResult | null>(null);
  const [pending, start] = useTransition();
  const c = confirm ? CONFIRM[confirm] : null;
  return (
    <div className="space-y-4">
      {result?.ok && result.message && <StatusLine tone="success">{result.message}</StatusLine>}
      {result && !result.ok && result.error && <StatusLine tone="error">{result.error}</StatusLine>}
      {result?.ok && result.details && <ConnectionDetailsBox details={result.details} />}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setConfirm('rotate-key')}>
          Make new API key
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setConfirm('rotate-secret')}>
          Replace webhook secret
        </Button>
        {active ? (
          <Button variant="secondary" size="sm" className="hover:border-red-600 hover:text-red-700" onClick={() => setConfirm('switch-off')}>
            Switch off
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setConfirm('switch-on')}>
            Switch on
          </Button>
        )}
      </div>
      <AlertDialog open={!!c} onClose={() => setConfirm(null)} title={c?.title ?? ''} description={c && <p>{c.body}</p>}>
        <Button variant="secondary" onClick={() => setConfirm(null)}>
          Back
        </Button>
        <Button
          variant={c?.danger ? 'destructive' : 'primary'}
          disabled={pending}
          onClick={() =>
            start(async () => {
              setResult(await credentialStepAction(clinicId, confirm!));
              setConfirm(null);
            })
          }
        >
          {pending ? 'Working…' : c?.button}
        </Button>
      </AlertDialog>
    </div>
  );
}
