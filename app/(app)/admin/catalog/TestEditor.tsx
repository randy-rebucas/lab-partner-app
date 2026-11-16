'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useFormAction } from '@/components/ui/useFormAction';
import { Button } from '@/components/ui/Button';
import { Field, Input, inputClass, Select, Textarea } from '@/components/ui/Field';
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { StatusLine } from '@/components/ui/StatusLine';
import { AGE_UNITS, splitAge, type AgeUnit } from '@/lib/catalog/flags';
import { SECTIONS, SPECIMEN_TYPES } from '@/lib/catalog/names';

// Range rows sit on one line, so their controls size to content instead of the field default (full width).
const rowInput = inputClass.replace('block w-full', 'inline-block');
import { saveTestAction } from './actions';

// The editor keeps every number as typed text, so "1." or "-" mid-typing isn't lost, and turns it
// into the stored shape only on save. All rules are checked on the server (lib/catalog/tests.ts);
// errors come back keyed by path ("analytes.2.ranges.0.high") and are shown on that field.

export type TestValues = {
  code: string;
  loinc: string;
  name: string;
  section: string;
  specimenType: string;
  turnaroundHours: number | null;
  aliases: string[];
  active: boolean;
  sample: boolean;
  analytes: {
    key: string;
    name: string;
    unit?: string | null;
    kind?: 'number' | 'text' | null;
    criticalLow?: number | null;
    criticalHigh?: number | null;
    ranges: { sex?: string | null; ageMinDays?: number | null; ageMaxDays?: number | null; low?: number | null; high?: number | null; text?: string | null }[];
  }[];
};

type RangeRow = { uid: number; sex: string; minN: string; minU: AgeUnit; maxN: string; maxU: AgeUnit; low: string; high: string; text: string };
type AnalyteRow = { uid: number; key: string; name: string; unit: string; kind: 'number' | 'text'; criticalLow: string; criticalHigh: string; ranges: RangeRow[] };

let nextUid = 1;
const uid = () => nextUid++;
const str = (n: number | null | undefined) => (typeof n === 'number' ? String(n) : '');

function toRangeRow(r: TestValues['analytes'][number]['ranges'][number]): RangeRow {
  const min = splitAge(r.ageMinDays);
  const max = splitAge(r.ageMaxDays);
  return { uid: uid(), sex: r.sex ?? 'any', minN: min.n, minU: min.unit, maxN: max.n, maxU: max.unit, low: str(r.low), high: str(r.high), text: r.text ?? '' };
}

const blankRange = (): RangeRow => ({ uid: uid(), sex: 'any', minN: '', minU: 'y', maxN: '', maxU: 'y', low: '', high: '', text: '' });
const blankAnalyte = (): AnalyteRow => ({ uid: uid(), key: '', name: '', unit: '', kind: 'number', criticalLow: '', criticalHigh: '', ranges: [blankRange()] });

const keyFrom = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+|_+$/g, '')
    .slice(0, 32);

const toNum = (s: string) => (s.trim() === '' ? null : Number(s));
const toDays = (n: string, u: AgeUnit) => (n.trim() === '' ? null : Math.round(Number(n) * AGE_UNITS[u]));

function payload(head: Omit<TestValues, 'analytes' | 'sample' | 'turnaroundHours' | 'aliases'> & { turnaroundHours: string; aliases: string }, analytes: AnalyteRow[], rangesChecked: boolean) {
  return {
    code: head.code,
    loinc: head.loinc,
    name: head.name,
    section: head.section,
    specimenType: head.specimenType,
    turnaroundHours: toNum(head.turnaroundHours),
    aliases: head.aliases.split(/[\n,]/).map((a) => a.trim()).filter(Boolean),
    active: head.active,
    rangesChecked,
    analytes: analytes.map((a) => ({
      key: a.key,
      name: a.name,
      unit: a.unit,
      kind: a.kind,
      criticalLow: a.kind === 'number' ? toNum(a.criticalLow) : null,
      criticalHigh: a.kind === 'number' ? toNum(a.criticalHigh) : null,
      ranges: a.ranges.map((r) => ({
        sex: r.sex,
        ageMinDays: toDays(r.minN, r.minU),
        ageMaxDays: toDays(r.maxN, r.maxU),
        low: a.kind === 'number' ? toNum(r.low) : null,
        high: a.kind === 'number' ? toNum(r.high) : null,
        text: r.text,
      })),
    })),
  };
}

export function TestEditor({ testId, values }: { testId: string | null; values: TestValues }) {
  const [state, onSubmit, pending] = useFormAction(saveTestAction.bind(null, testId));
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const [head, setHead] = useState({
    code: values.code,
    loinc: values.loinc,
    name: values.name,
    section: values.section,
    specimenType: values.specimenType,
    turnaroundHours: str(values.turnaroundHours),
    aliases: values.aliases.join(', '),
    active: values.active,
  });
  const [analytes, setAnalytes] = useState<AnalyteRow[]>(() =>
    values.analytes.length
      ? values.analytes.map((a) => ({
          uid: uid(),
          key: a.key,
          name: a.name,
          unit: a.unit ?? '',
          kind: a.kind ?? 'number',
          criticalLow: str(a.criticalLow),
          criticalHigh: str(a.criticalHigh),
          ranges: a.ranges.map(toRangeRow),
        }))
      : [blankAnalyte()]
  );
  const [rangesChecked, setRangesChecked] = useState(false);

  const setA = (i: number, patch: Partial<AnalyteRow>) => setAnalytes((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setR = (i: number, k: number, patch: Partial<RangeRow>) =>
    setAnalytes((rows) => rows.map((r, j) => (j === i ? { ...r, ranges: r.ranges.map((x, m) => (m === k ? { ...x, ...patch } : x)) } : r)));
  const move = (i: number, by: -1 | 1) =>
    setAnalytes((rows) => {
      const next = [...rows];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });
  const h = (k: keyof typeof head) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setHead((v) => ({ ...v, [k]: e.target.value }));

  const errorsUnder = (prefix: string) =>
    Object.entries(fe)
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => v);

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <input type="hidden" name="test" value={JSON.stringify(payload(head, analytes, rangesChecked))} />
      {state?.ok && state.message && <StatusLine tone="success">{state.message}</StatusLine>}
      {state && !state.ok && (state.error || fe.analytes) && (
        <StatusLine tone="error">
          {state.error}
          {fe.analytes && <> {fe.analytes}</>}
        </StatusLine>
      )}

      <Panel>
        <PanelHeader title="Test" subtitle="What clinics order and what the specimen is." />
        <PanelBody className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-[2fr_1fr_1fr]">
            <Field id="name" label="Test name" error={fe.name}>
              <Input id="name" value={head.name} onChange={h('name')} required error={fe.name} />
            </Field>
            <Field id="code" label="Lab code" hint="Printed on labels." error={fe.code}>
              <Input id="code" value={head.code} onChange={h('code')} required className="font-mono uppercase" hasHint error={fe.code} />
            </Field>
            <Field id="loinc" label="LOINC" hint="If known." error={fe.loinc}>
              <Input id="loinc" value={head.loinc} onChange={h('loinc')} className="font-mono" placeholder="58410-2" hasHint error={fe.loinc} />
            </Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field id="section" label="Section" error={fe.section}>
              <Select id="section" value={head.section} onChange={h('section')} error={fe.section}>
                <option value="">Choose…</option>
                {SECTIONS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field id="specimenType" label="Specimen" error={fe.specimenType}>
              <Select id="specimenType" value={head.specimenType} onChange={h('specimenType')} error={fe.specimenType}>
                <option value="">Choose…</option>
                {SPECIMEN_TYPES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field id="turnaroundHours" label="Turnaround target (hours)" hint="From collection to release." error={fe.turnaroundHours}>
              <Input
                id="turnaroundHours"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={head.turnaroundHours}
                onChange={h('turnaroundHours')}
                className="font-mono"
                hasHint
                error={fe.turnaroundHours}
              />
            </Field>
          </div>
          <Field
            id="aliases"
            label="Common names clinics use"
            hint="Separated by commas. “Add common names” on a clinic’s page maps all of these at once."
            error={fe.aliases}
          >
            <Textarea id="aliases" rows={2} value={head.aliases} onChange={h('aliases')} error={fe.aliases} />
          </Field>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Analytes"
          subtitle="One line per value on the report, in report order. The key is what MyClinicSoft receives."
          actions={
            <Button variant="secondary" size="sm" onClick={() => setAnalytes((rows) => [...rows, blankAnalyte()])}>
              <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Add analyte
            </Button>
          }
        />
        <ol className="divide-y divide-gray-200">
          {analytes.map((a, i) => {
            const p = `analytes.${i}`;
            const num = a.kind === 'number';
            return (
              <li key={a.uid} className="space-y-4 px-5 py-5" aria-label={`Analyte ${i + 1}${a.name ? `, ${a.name}` : ''}`}>
                <div className="flex flex-wrap items-end gap-4">
                  <div className="min-w-48 flex-[2]">
                    <Field id={`${p}.name`} label="Name" error={fe[`${p}.name`]}>
                      <Input
                        id={`${p}.name`}
                        value={a.name}
                        onChange={(e) => {
                          const name = e.target.value;
                          setA(i, { name, ...(a.key === '' || a.key === keyFrom(a.name) ? { key: keyFrom(name) } : {}) });
                        }}
                        error={fe[`${p}.name`]}
                      />
                    </Field>
                  </div>
                  <div className="min-w-32 flex-1">
                    <Field id={`${p}.key`} label="Key" error={fe[`${p}.key`]}>
                      <Input id={`${p}.key`} value={a.key} onChange={(e) => setA(i, { key: e.target.value })} className="font-mono" error={fe[`${p}.key`]} />
                    </Field>
                  </div>
                  <div className="min-w-28 flex-1">
                    <Field id={`${p}.unit`} label="Unit" error={fe[`${p}.unit`]}>
                      <Input id={`${p}.unit`} value={a.unit} onChange={(e) => setA(i, { unit: e.target.value })} placeholder="mg/dL" error={fe[`${p}.unit`]} />
                    </Field>
                  </div>
                  <div className="min-w-32 flex-1">
                    <Field id={`${p}.kind`} label="Result is">
                      <Select id={`${p}.kind`} value={a.kind} onChange={(e) => setA(i, { kind: e.target.value as AnalyteRow['kind'] })}>
                        <option value="number">A number</option>
                        <option value="text">Words</option>
                      </Select>
                    </Field>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" aria-label={`Move ${a.name || `analyte ${i + 1}`} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${a.name || `analyte ${i + 1}`} down`}
                      disabled={i === analytes.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${a.name || `analyte ${i + 1}`}`}
                      disabled={analytes.length === 1}
                      onClick={() => setAnalytes((rows) => rows.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2">
                    <p className="text-xs font-semibold text-gray-600">{num ? 'Reference ranges' : 'Normal result'}</p>
                    <Button variant="ghost" size="sm" onClick={() => setA(i, { ranges: [...a.ranges, blankRange()] })}>
                      <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      Add range
                    </Button>
                  </div>
                  {a.ranges.length === 0 && <p className="px-4 py-3 text-sm text-gray-500">{num ? 'No range yet.' : 'No normal result set; nothing is printed beside the value.'}</p>}
                  <ul className="divide-y divide-gray-100">
                    {a.ranges.map((r, k) => {
                      const rp = `${p}.ranges.${k}`;
                      const bad = (f: string) => (fe[`${rp}.${f}`] ? true : undefined);
                      const errs = errorsUnder(`${rp}.`);
                      const label = `range ${k + 1} of ${a.name || `analyte ${i + 1}`}`;
                      return (
                        <li key={r.uid} className="space-y-2 px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                            <select
                              aria-label={`Who, ${label}`}
                              value={r.sex}
                              onChange={(e) => setR(i, k, { sex: e.target.value })}
                              aria-invalid={bad('sex')}
                              className={`${rowInput} w-auto`}
                            >
                              <option value="any">Anyone</option>
                              <option value="male">Male</option>
                              <option value="female">Female</option>
                            </select>
                            <span>aged</span>
                            <AgeInput label={`Age from, ${label}`} n={r.minN} unit={r.minU} invalid={bad('ageMinDays')} onChange={(n, u) => setR(i, k, { minN: n, minU: u })} placeholder="0" />
                            <span>to under</span>
                            <AgeInput label={`Age under, ${label}`} n={r.maxN} unit={r.maxU} invalid={bad('ageMaxDays')} onChange={(n, u) => setR(i, k, { maxN: n, maxU: u })} placeholder="any" />
                            {num ? (
                              <>
                                <span className="ml-2">low</span>
                                <input
                                  type="number"
                                  step="any"
                                  inputMode="decimal"
                                  aria-label={`Low, ${label}`}
                                  value={r.low}
                                  onChange={(e) => setR(i, k, { low: e.target.value })}
                                  aria-invalid={bad('low')}
                                  className={`${rowInput} w-24 font-mono`}
                                />
                                <span>high</span>
                                <input
                                  type="number"
                                  step="any"
                                  inputMode="decimal"
                                  aria-label={`High, ${label}`}
                                  value={r.high}
                                  onChange={(e) => setR(i, k, { high: e.target.value })}
                                  aria-invalid={bad('high')}
                                  className={`${rowInput} w-24 font-mono`}
                                />
                              </>
                            ) : (
                              <>
                                <span className="ml-2">normal</span>
                                <input
                                  aria-label={`Normal result, ${label}`}
                                  value={r.text}
                                  onChange={(e) => setR(i, k, { text: e.target.value })}
                                  aria-invalid={bad('text')}
                                  placeholder="Negative"
                                  className={`${rowInput} w-40`}
                                />
                              </>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="ml-auto"
                              aria-label={`Remove ${label}`}
                              onClick={() => setA(i, { ranges: a.ranges.filter((_, m) => m !== k) })}
                            >
                              <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                            </Button>
                          </div>
                          {errs.map((e) => (
                            <p key={e} className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
                              {e}
                            </p>
                          ))}
                        </li>
                      );
                    })}
                  </ul>
                  {fe[`${p}.ranges`] && <p className="mx-4 mb-3 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{fe[`${p}.ranges`]}</p>}
                </div>

                {num && (
                  <div className="grid gap-4 sm:grid-cols-2 lg:max-w-md">
                    <Field id={`${p}.criticalLow`} label="Critical below" hint="Needs a call to the clinic before release." error={fe[`${p}.criticalLow`]}>
                      <Input
                        id={`${p}.criticalLow`}
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={a.criticalLow}
                        onChange={(e) => setA(i, { criticalLow: e.target.value })}
                        className="font-mono"
                        hasHint
                        error={fe[`${p}.criticalLow`]}
                      />
                    </Field>
                    <Field id={`${p}.criticalHigh`} label="Critical above" error={fe[`${p}.criticalHigh`]}>
                      <Input
                        id={`${p}.criticalHigh`}
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={a.criticalHigh}
                        onChange={(e) => setA(i, { criticalHigh: e.target.value })}
                        className="font-mono"
                        error={fe[`${p}.criticalHigh`]}
                      />
                    </Field>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </Panel>

      <div className="flex flex-wrap items-center justify-end gap-4">
        {values.sample && (
          <label className="mr-auto flex items-center gap-2 text-sm text-gray-900">
            <input
              type="checkbox"
              checked={rangesChecked}
              onChange={(e) => setRangesChecked(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-2 focus:ring-brand-teal"
            />
            Ranges checked against our analyser and reagents
          </label>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : testId ? 'Save test' : 'Add test'}
        </Button>
      </div>
    </form>
  );
}

function AgeInput({
  label,
  n,
  unit,
  invalid,
  placeholder,
  onChange,
}: {
  label: string;
  n: string;
  unit: AgeUnit;
  invalid?: boolean;
  placeholder: string;
  onChange: (n: string, unit: AgeUnit) => void;
}) {
  return (
    <span className="inline-flex">
      <input
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        aria-label={label}
        value={n}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value, unit)}
        aria-invalid={invalid}
        className={`${rowInput} w-16 rounded-r-none font-mono`}
      />
      <select
        aria-label={`${label}, unit`}
        value={unit}
        onChange={(e) => onChange(n, e.target.value as AgeUnit)}
        className={`${rowInput} -ml-px w-auto rounded-l-none`}
      >
        <option value="d">days</option>
        <option value="mo">months</option>
        <option value="y">years</option>
      </select>
    </span>
  );
}
