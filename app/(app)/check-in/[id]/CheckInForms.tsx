'use client';

import { useFormAction } from '@/components/ui/useFormAction';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { StatusLine } from '@/components/ui/StatusLine';
import { CONTAINERS, ID_TYPES, SPECIMEN_CONDITIONS } from '@/lib/specimen-options';
import { checkInAction, collectAction } from '../actions';

function Check({ id, label, error }: { id: string; label: React.ReactNode; error?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-start gap-3 rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-900 has-[:checked]:border-brand-teal has-[:checked]:bg-brand-teal-light">
        <input
          id={id}
          name={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-2 focus:ring-brand-teal"
        />
        <span>{label}</span>
      </label>
      {error && (
        <p id={`${id}-error`} className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function CheckInForm({ orderId, name, birthDate, notYetAccepted }: { orderId: string; name: string; birthDate: string | null; notYetAccepted: boolean }) {
  const [state, onSubmit, pending] = useFormAction(checkInAction.bind(null, orderId));
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {state && !state.ok && state.error && <StatusLine tone="error">{state.error}</StatusLine>}
      {notYetAccepted && <StatusLine tone="info">This order hasn’t been accepted yet. Checking the patient in accepts it.</StatusLine>}
      <Field id="idType" label="ID shown" error={fe.idType}>
        <Select id="idType" defaultValue="" error={fe.idType}>
          <option value="" disabled>
            Choose…
          </option>
          {ID_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
      </Field>
      <Check
        id="nameMatches"
        error={fe.nameMatches}
        label={
          <>
            The name on the ID is <strong className="font-semibold">{name}</strong>
          </>
        }
      />
      <Check
        id="birthDateMatches"
        error={fe.birthDateMatches}
        label={
          birthDate ? (
            <>
              The birth date on the ID is <strong className="font-mono font-semibold tabular-nums">{birthDate}</strong>
            </>
          ) : (
            'The clinic didn’t send a birth date. I checked the patient’s birth date on the ID.'
          )
        }
      />
      <Field id="note" label="Note" hint="Optional. For example: guardian present, name spelled differently on ID." error={fe.note}>
        <Textarea id="note" rows={2} maxLength={200} error={fe.note} />
      </Field>
      <p className="text-xs text-gray-500">If the name or birth date doesn’t match, don’t collect. Reject the order from its details page so the clinic can correct it.</p>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Checking in…' : 'Check in'}
        </Button>
      </div>
    </form>
  );
}

export function CollectForm({
  orderId,
  defaultContainer,
  specimenType,
  defaultTime,
  instructions,
}: {
  orderId: string;
  defaultContainer: string;
  specimenType: string;
  defaultTime: string;
  instructions: string | null;
}) {
  const [state, onSubmit, pending] = useFormAction(collectAction.bind(null, orderId));
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  if (state?.ok && state.specimenId) {
    return (
      <div className="space-y-4">
        <StatusLine tone="success">{state.message}</StatusLine>
        <ButtonLink href={`/labels/${state.specimenId}?print=1`} target="_blank" rel="noopener">
          Print label
        </ButtonLink>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {state && !state.ok && state.error && <StatusLine tone="error">{state.error}</StatusLine>}
      {instructions && <StatusLine tone="info">Clinic’s instructions: {instructions}</StatusLine>}
      <Field id="container" label="Container" hint={`The catalog asks for ${specimenType.toLowerCase()}.`} error={fe.container}>
        <Select id="container" defaultValue={defaultContainer} error={fe.container}>
          {CONTAINERS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="collectedAt" label="Collected at" error={fe.collectedAt}>
          <Input id="collectedAt" type="datetime-local" defaultValue={defaultTime} className="font-mono" error={fe.collectedAt} />
        </Field>
        <Field id="condition" label="Condition" error={fe.condition}>
          <Select id="condition" defaultValue="Good" error={fe.condition}>
            {SPECIMEN_CONDITIONS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id="note" label="Note" hint="Optional. For example: difficult draw, second attempt." error={fe.note}>
        <Textarea id="note" rows={2} maxLength={200} error={fe.note} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Record collection'}
        </Button>
      </div>
    </form>
  );
}
