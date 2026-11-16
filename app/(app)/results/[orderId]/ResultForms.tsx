'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Paperclip, Trash2 } from 'lucide-react';
import { useFormAction } from '@/components/ui/useFormAction';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, inputClass, Textarea } from '@/components/ui/Field';
import { Mono } from '@/components/ui/Panel';
import { StatusLine } from '@/components/ui/StatusLine';
import { ResultValue } from '@/components/ResultValue';
import { flagValue, formatRange, pickRange, type AnalyteLimits, type Sex } from '@/lib/catalog/flags';
import { amendAction, criticalCallAction, releaseAction, removeAttachmentAction, saveResultAction, sendBackAction, type ResultActionResult } from '../actions';

export type AnalyteSpec = AnalyteLimits & { key: string; name: string };
export type Patient = { sex?: Sex; ageDays?: number };

const FLAG_FOR = (flag: string | null, direction: string | null) =>
  flag === 'C' ? (direction === 'high' ? 'critical-high' : 'critical-low') : flag === 'H' ? 'high' : flag === 'L' ? 'low' : 'normal';

/** One row per analyte: the input, the range for this patient, and the flag as you type. */
function ValueInputs({ analytes, patient, initial, errors }: { analytes: AnalyteSpec[]; patient: Patient; initial: Record<string, string>; errors: Record<string, string> }) {
  const [vals, setVals] = useState(initial);
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-600">
          <tr>
            <th scope="col" className="px-4 py-2">Analyte</th>
            <th scope="col" className="px-4 py-2">Value</th>
            <th scope="col" className="px-4 py-2">Flag</th>
            <th scope="col" className="px-4 py-2">Reference</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {analytes.map((a) => {
            const v = vals[a.key] ?? '';
            const f = v.trim() ? flagValue(a, v, patient.sex, patient.ageDays) : { flag: null, direction: null };
            const band = pickRange(a.ranges, patient.sex, patient.ageDays);
            const id = `v.${a.key}`;
            const err = errors[id];
            return (
              <tr key={a.key} className={f.flag === 'C' ? 'bg-red-50' : ''}>
                <th scope="row" className="px-4 py-2 text-left font-normal">
                  <label htmlFor={id} className="text-gray-900">
                    {a.name}
                  </label>
                  {a.unit && <span className="ml-1 text-xs text-gray-500">{a.unit}</span>}
                </th>
                <td className="px-4 py-2">
                  <input
                    id={id}
                    name={id}
                    value={v}
                    onChange={(e) => setVals((x) => ({ ...x, [a.key]: e.target.value }))}
                    inputMode={a.kind === 'text' ? 'text' : 'decimal'}
                    autoComplete="off"
                    aria-invalid={err ? true : undefined}
                    aria-describedby={err ? `${id}-error` : undefined}
                    className={`${inputClass.replace('block w-full', 'block w-32')} font-mono`}
                  />
                  {err && (
                    <p id={`${id}-error`} className="mt-1 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
                      {err}
                    </p>
                  )}
                </td>
                <td className="px-4 py-2" aria-live="polite">
                  {f.flag ? <ResultValue value="" flag={FLAG_FOR(f.flag, f.direction)} /> : <span className="text-xs text-gray-400">—</span>}
                </td>
                <td className="px-4 py-2 text-xs text-gray-600">
                  <Mono>{formatRange(band, a.kind === 'text' ? null : a.unit) || 'No range for this patient'}</Mono>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function EntryForm({ orderId, analytes, patient, initial, interpretation }: { orderId: string; analytes: AnalyteSpec[]; patient: Patient; initial: Record<string, string>; interpretation: string }) {
  const [state, onSubmit, pending] = useFormAction(saveResultAction.bind(null, orderId));
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {state?.ok && state.message && <StatusLine tone="success">{state.message}</StatusLine>}
      {state && !state.ok && state.error && <StatusLine tone="error">{state.error}</StatusLine>}
      <ValueInputs analytes={analytes} patient={patient} initial={initial} errors={fe} />
      <p className="text-xs text-gray-500">Type a number, a bound like &lt;0.5, or “Not done”. Flags follow the range for this patient’s sex and age.</p>
      <Field id="interpretation" label="Remarks" hint="Optional. Printed on the report and sent to the clinic.">
        <Textarea id="interpretation" rows={2} maxLength={1000} defaultValue={interpretation} />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="submit" name="intent" value="draft" variant="secondary" disabled={pending}>
          Save draft
        </Button>
        <Button type="submit" name="intent" value="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Send for validation'}
        </Button>
      </div>
    </form>
  );
}

export function AttachmentBox({
  orderId,
  files,
  canAdd,
}: {
  orderId: string;
  files: { fileId: string; name: string; size: number; addedBy: string }[];
  canAdd: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<ResultActionResult | null>(null);
  const [, start] = useTransition();
  const upload = async (file: File) => {
    setBusy(true);
    setMessage(null);
    const body = new FormData();
    body.set('orderId', orderId);
    body.set('file', file);
    const res = await fetch('/api/attachments', { method: 'POST', body });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (input.current) input.current.value = '';
    setMessage(res.ok ? { ok: true, message: `Attached ${json.name}.` } : { ok: false, error: json.error ?? 'The file could not be attached.' });
    router.refresh();
  };
  return (
    <div className="space-y-3">
      {message && <StatusLine tone={message.ok ? 'success' : 'error'}>{message.ok ? message.message : message.error}</StatusLine>}
      {files.length === 0 ? (
        <p className="text-sm text-gray-500">No files attached.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {files.map((f) => (
            <li key={f.fileId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <Paperclip className="h-4 w-4 shrink-0 text-gray-400" strokeWidth={1.75} aria-hidden="true" />
              <a href={`/api/attachments/${f.fileId}`} target="_blank" rel="noopener" className="min-w-0 flex-1 truncate font-semibold text-brand-teal-dark underline-offset-2 hover:underline">
                {f.name}
              </a>
              <Mono className="text-xs text-gray-500">{f.size < 1024 ? `${f.size} B` : f.size < 1048576 ? `${Math.round(f.size / 1024)} KB` : `${(f.size / 1048576).toFixed(1)} MB`}</Mono>
              {canAdd && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${f.name}`}
                  onClick={() =>
                    start(async () => {
                      setMessage(await removeAttachmentAction(orderId, f.fileId));
                      router.refresh();
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canAdd && (
        <div>
          <label htmlFor="attachment" className="block text-sm font-medium text-gray-900">
            Attach a file
          </label>
          <input
            ref={input}
            id="attachment"
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            disabled={busy}
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            className="mt-1.5 block text-sm text-gray-600 file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-gray-900 hover:file:border-gray-900"
          />
          <p className="mt-1 text-xs text-gray-500">{busy ? 'Uploading…' : 'PDF, PNG or JPEG, up to 10 MB. Files attach to the draft.'}</p>
        </div>
      )}
    </div>
  );
}

export function CriticalCallForm({ orderId, defaultTime }: { orderId: string; defaultTime: string }) {
  const [state, onSubmit, pending] = useFormAction(criticalCallAction.bind(null, orderId));
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {state && !state.ok && state.error && <StatusLine tone="error">{state.error}</StatusLine>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="takenBy" label="Taken at the clinic by" hint="Name and role, for example Nurse Joy Bautista." error={fe.takenBy}>
          <Input id="takenBy" hasHint error={fe.takenBy} />
        </Field>
        <Field id="at" label="Called at" error={fe.at}>
          <Input id="at" type="datetime-local" defaultValue={defaultTime} className="font-mono" error={fe.at} />
        </Field>
      </div>
      <Field id="note" label="Note" hint="Optional. For example: read back confirmed.">
        <Textarea id="note" rows={2} maxLength={300} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Record the call'}
        </Button>
      </div>
    </form>
  );
}

export function ValidationActions({ orderId, blocker, clinicName }: { orderId: string; blocker: string | null; clinicName: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [sendingBack, setSendingBack] = useState(false);
  const [result, setResult] = useState<ResultActionResult | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="space-y-3">
      {result && <StatusLine tone={result.ok ? 'success' : 'error'}>{result.ok ? result.message : result.error}</StatusLine>}
      {blocker && <StatusLine tone="warning">{blocker}</StatusLine>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={() => setSendingBack(true)}>
          Send back
        </Button>
        <Button disabled={!!blocker || busy} onClick={() => setConfirm(true)}>
          Release results
        </Button>
      </div>
      <AlertDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Release these results?"
        description={
          <p>
            They are signed with your name and licence number and sent to {clinicName} now. A later change is a correction that the clinic sees as a new version.
          </p>
        }
      >
        <Button variant="secondary" onClick={() => setConfirm(false)}>
          Back
        </Button>
        <Button
          disabled={busy}
          onClick={() =>
            start(async () => {
              const r = await releaseAction(orderId);
              setResult(r);
              setConfirm(false);
              router.refresh();
            })
          }
        >
          Release results
        </Button>
      </AlertDialog>
      {sendingBack && <SendBackDialog orderId={orderId} onClose={() => setSendingBack(false)} />}
    </div>
  );
}

function SendBackDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [state, onSubmit, pending] = useFormAction(sendBackAction.bind(null, orderId));
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <Dialog open onClose={onClose} title="Send back to the bench?" subtitle="The result returns to entry with your note. Nothing is sent to the clinic.">
      <form onSubmit={onSubmit} className="space-y-5">
        {state && !state.ok && state.error && <StatusLine tone="error">{state.error}</StatusLine>}
        <Field id="note" label="What needs correcting" error={fe.note}>
          <Textarea id="note" rows={3} maxLength={300} error={fe.note} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Sending…' : 'Send back'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function AmendButton({ orderId, analytes, patient, initial, interpretation }: { orderId: string; analytes: AnalyteSpec[]; patient: Patient; initial: Record<string, string>; interpretation: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Correct result
      </Button>
      {open && <AmendDialog orderId={orderId} analytes={analytes} patient={patient} initial={initial} interpretation={interpretation} onClose={() => setOpen(false)} />}
    </>
  );
}

function AmendDialog({
  orderId,
  analytes,
  patient,
  initial,
  interpretation,
  onClose,
}: {
  orderId: string;
  analytes: AnalyteSpec[];
  patient: Patient;
  initial: Record<string, string>;
  interpretation: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, onSubmit, pending] = useFormAction(amendAction.bind(null, orderId));
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) {
      onClose();
      router.refresh();
    }
  }
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <Dialog
      open
      onClose={onClose}
      wide
      title="Correct a released result"
      subtitle="This makes a new version. The released one stays on record as replaced. Another signatory releases the correction, and the clinic receives it as a correction."
    >
      <form onSubmit={onSubmit} className="space-y-5">
        {state && !state.ok && state.error && <StatusLine tone="error">{state.error}</StatusLine>}
        <Field id="reason" label="Reason for the correction" hint="The clinic sees this." error={fe.reason}>
          <Textarea id="reason" rows={2} maxLength={300} error={fe.reason} />
        </Field>
        <ValueInputs analytes={analytes} patient={patient} initial={initial} errors={fe} />
        <Field id="interpretation" label="Remarks">
          <Textarea id="interpretation" rows={2} maxLength={1000} defaultValue={interpretation} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Send correction for validation'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
