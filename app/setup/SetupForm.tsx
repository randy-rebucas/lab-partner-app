'use client';

import { useFormAction } from '@/components/ui/useFormAction';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { StatusLine } from '@/components/ui/StatusLine';
import { setupAction } from './actions';

export function SetupForm({ tokenRequired, tokenMissing }: { tokenRequired: boolean; tokenMissing: boolean }) {
  const [state, onSubmit, pending] = useFormAction(setupAction);
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  if (tokenMissing) {
    return (
      <StatusLine tone="warning">
        Setup is locked on this server. Add a long random <span className="font-mono">SETUP_TOKEN</span> to its environment and restart it, then open this page again
        and enter that token. It stops a stranger from claiming a new install.
      </StatusLine>
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {state && !state.ok && state.error && <StatusLine tone="error">{state.error}</StatusLine>}
      {tokenRequired && (
        <Field id="token" label="Setup token" hint="The SETUP_TOKEN value from this server’s environment." error={fe.token}>
          <Input id="token" type="password" autoComplete="off" required className="font-mono" hasHint error={fe.token} />
        </Field>
      )}

      <fieldset className="space-y-4">
        <legend className="text-sm font-bold text-gray-900">Your lab</legend>
        <Field id="labName" label="Lab name" error={fe.labName}>
          <Input id="labName" required autoComplete="organization" error={fe.labName} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="licenceNo" label="DOH licence number" hint="Printed on reports. You can add it later." error={fe.licenceNo}>
            <Input id="licenceNo" className="font-mono" hasHint error={fe.licenceNo} />
          </Field>
          <Field id="phone" label="Phone" error={fe.phone}>
            <Input id="phone" type="tel" autoComplete="tel" error={fe.phone} />
          </Field>
        </div>
        <Field id="address" label="Address" error={fe.address}>
          <Textarea id="address" rows={2} autoComplete="street-address" error={fe.address} />
        </Field>
        <label className="flex items-start gap-3 text-sm text-gray-900">
          <input
            type="checkbox"
            name="sampleTests"
            defaultChecked
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-2 focus:ring-brand-teal"
          />
          <span>
            Start the test catalog with five sample tests (CBC, urinalysis, FBS, lipid profile, creatinine).
            <span className="block text-xs text-gray-500">Their reference ranges are textbook values, marked as samples until you check them against your analyser.</span>
          </span>
        </label>
      </fieldset>

      <div className="border-t border-gray-200 pt-6">
      <fieldset className="space-y-4">
        <legend className="text-sm font-bold text-gray-900">First admin (you)</legend>
        <Field id="name" label="Full name" error={fe.name}>
          <Input id="name" required autoComplete="name" error={fe.name} />
        </Field>
        <Field id="email" label="Email" error={fe.email}>
          <Input id="email" type="email" required autoComplete="email" error={fe.email} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="password" label="Password" hint="At least 12 characters." error={fe.password}>
            <Input id="password" type="password" required autoComplete="new-password" hasHint error={fe.password} />
          </Field>
          <Field id="confirm" label="Password again" error={fe.confirm}>
            <Input id="confirm" type="password" required autoComplete="new-password" error={fe.confirm} />
          </Field>
        </div>
      </fieldset>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Setting up…' : 'Set up the lab'}
        </Button>
      </div>
    </form>
  );
}
