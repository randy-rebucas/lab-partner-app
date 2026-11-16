'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ListPlus, Tags, Trash2 } from 'lucide-react';
import { useFormAction } from '@/components/ui/useFormAction';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { EmptyState, Mono, Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { StatusLine } from '@/components/ui/StatusLine';
import { addCommonNamesAction, addMappingAction, removeMappingAction, type MappingActionResult } from './actions';

type TestOption = { id: string; code: string; name: string; active: boolean };
type RefusedRow = { id: string; testType: string; testCode: string; reason: 'unmapped' | 'test-off'; count: number; lastAt: string };
type MappingRow = { id: string; clinicTestType: string; clinicTestCode: string; testName: string; testCode: string; testActive: boolean };

export function MappingsClient({
  clinicId,
  tests,
  mappings,
  refused,
}: {
  clinicId: string;
  tests: TestOption[];
  mappings: MappingRow[];
  refused: RefusedRow[];
}) {
  const [prefill, setPrefill] = useState({ testType: '', testCode: '' });
  const router = useRouter();
  const [state, onSubmit, pending] = useFormAction(addMappingAction.bind(null, clinicId));
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const [formKey, setFormKey] = useState(0);
  const [seen, setSeen] = useState<MappingActionResult | undefined>();
  const [stepResult, setStepResult] = useState<MappingActionResult | null>(null);
  const [removing, setRemoving] = useState<MappingRow | null>(null);
  const [busy, start] = useTransition();

  // A new form result replaces any earlier message. A successful add clears the form for the next
  // name; a refused one keeps what was typed.
  if (state !== seen) {
    setSeen(state);
    setStepResult(null);
    if (state?.ok) {
      setPrefill({ testType: '', testCode: '' });
      setFormKey((k) => k + 1);
    }
  }

  const run = (fn: () => Promise<MappingActionResult>) =>
    start(async () => {
      const r = await fn();
      setStepResult(r);
      setRemoving(null);
      router.refresh();
    });

  const message = stepResult ?? state;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-4">
        {message?.ok && message.message && <StatusLine tone="success">{message.message}</StatusLine>}
        {message && !message.ok && message.error && <StatusLine tone="error">{message.error}</StatusLine>}
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Names this clinic uses"
            subtitle={`${mappings.length} ${mappings.length === 1 ? 'name' : 'names'}`}
            actions={
              tests.length > 0 && (
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => run(() => addCommonNamesAction(clinicId))}>
                  <ListPlus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  Add common names
                </Button>
              )
            }
          />
          {mappings.length === 0 ? (
            <EmptyState
              icon={<Tags className="h-5 w-5" strokeWidth={1.75} />}
              title="No test names yet"
              hint={
                tests.length
                  ? 'Every order from this clinic is refused until its test names are here. “Add common names” adds the usual ones (CBC, Urinalysis, FBS…) in one step.'
                  : 'Add tests to the catalog first.'
              }
              action={!tests.length && <ButtonLink href="/admin/catalog">Open the test catalog</ButtonLink>}
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-600">
                <tr>
                  <th scope="col" className="px-5 py-2">
                    Clinic’s name
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Code
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Our test
                  </th>
                  <th scope="col" className="px-3 py-2">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {mappings.map((m) => (
                  <tr key={m.id}>
                    <td className="px-5 py-2.5 text-gray-900">{m.clinicTestType || <span className="text-gray-400">Any name</span>}</td>
                    <td className="px-3 py-2.5">{m.clinicTestCode ? <Mono className="whitespace-nowrap text-gray-900">{m.clinicTestCode}</Mono> : <span className="text-gray-400">—</span>}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-gray-900">{m.testName}</span> <Mono className="text-xs text-gray-500">{m.testCode}</Mono>
                      {!m.testActive && (
                        <Badge tone="gray" className="ml-2">
                          Switched off
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Button variant="ghost" size="icon" aria-label={`Remove ${m.clinicTestType || m.clinicTestCode}`} onClick={() => setRemoving(m)}>
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <div className="space-y-6">
      <Panel>
        <PanelHeader title="Add a name" subtitle="As the clinic’s MyClinicSoft sends it. Case and punctuation don’t matter." />
        <PanelBody>
          <form key={formKey} onSubmit={onSubmit} className="space-y-5">
            <Field id="clinicTestType" label="Clinic’s test name" hint="For example CBC with platelet count." error={fe.clinicTestType}>
              <Input id="clinicTestType" defaultValue={prefill.testType} hasHint error={fe.clinicTestType} />
            </Field>
            <Field id="clinicTestCode" label="Clinic’s test code" hint="Optional. A code match wins over a name match." error={fe.clinicTestCode}>
              <Input id="clinicTestCode" defaultValue={prefill.testCode} className="font-mono" hasHint error={fe.clinicTestCode} />
            </Field>
            <Field id="testId" label="Our test" error={fe.testId}>
              <Select id="testId" defaultValue="" error={fe.testId}>
                <option value="" disabled>
                  Choose…
                </option>
                {tests.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code}){t.active ? '' : ', switched off'}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex justify-end">
              <Button type="submit" disabled={pending || !tests.length}>
                {pending ? 'Adding…' : 'Add name'}
              </Button>
            </div>
          </form>
        </PanelBody>
      </Panel>
      {refused.length > 0 && (
        <Panel className="overflow-hidden">
          <PanelHeader title="Refused recently" subtitle="Test names this clinic sent that matched nothing here, in the last 30 days." />
          <ul className="divide-y divide-gray-100">
            {refused.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-gray-900">
                    {r.testType || <span className="text-gray-400">No name</span>}
                    {r.testCode && <Mono className="ml-2 text-xs text-gray-500">{r.testCode}</Mono>}
                  </p>
                  <p className="text-xs text-gray-500">
                    {r.reason === 'test-off' ? 'Test switched off' : 'No matching name'} · <Mono>{r.count}</Mono> {r.count === 1 ? 'order' : 'orders'} · last{' '}
                    <Mono>{new Date(r.lastAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Mono>
                  </p>
                </div>
                {r.reason === 'unmapped' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={`Use ${r.testType || r.testCode} in Add a name`}
                    onClick={() => {
                      setPrefill({ testType: r.testType, testCode: r.testCode });
                      setFormKey((k) => k + 1);
                      document.getElementById('testId')?.focus();
                    }}
                  >
                    Use
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      </div>

      <AlertDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`Remove “${removing?.clinicTestType || removing?.clinicTestCode}”?`}
        description={<p>New orders from this clinic under this name are refused as an unknown test. Orders already here are not affected.</p>}
      >
        <Button variant="secondary" onClick={() => setRemoving(null)}>
          Back
        </Button>
        <Button variant="destructive" disabled={busy} onClick={() => removing && run(() => removeMappingAction(clinicId, removing.id))}>
          Remove
        </Button>
      </AlertDialog>
    </div>
  );
}
