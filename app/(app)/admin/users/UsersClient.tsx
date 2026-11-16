'use client';

import { useState, useTransition } from 'react';
import { useFormAction } from '@/components/ui/useFormAction';
import { Copy, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Field';
import { Mono, PageHeader, Panel } from '@/components/ui/Panel';
import { StatusLine } from '@/components/ui/StatusLine';
import { ROLES, ROLE_INFO, isRole } from '@/lib/auth/roles';
import type { UserState } from '@/lib/users';
import { accountStepAction, createUserAction, updateUserAction, type ActionResult } from '../actions';

export type UserRow = {
  id: string;
  name: string;
  email: string;
  roles: string[];
  licenceNo: string;
  state: UserState;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  isMe: boolean;
};

const STATE_BADGE: Record<UserState, { label: string; tone: 'emerald' | 'amber' | 'outline' | 'gray' }> = {
  'can-sign-in': { label: 'Can sign in', tone: 'emerald' },
  locked: { label: 'Locked', tone: 'amber' },
  'not-set-up': { label: 'Not set up yet', tone: 'outline' },
  off: { label: 'Switched off', tone: 'gray' },
};

const manila = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', ...opts });

function lastSignIn(iso: string | null): string {
  if (!iso) return 'Never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return `Today, ${manila(iso, { hour: 'numeric', minute: '2-digit' })}`;
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return manila(iso, { month: 'short', day: 'numeric', year: 'numeric' });
}

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

/** A one-time password, shown once, with a copy button. */
function OneTimePassword({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <StatusLine tone="info">
      <p>Give them this one-time password. It is shown only now; they choose their own at first sign-in.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="select-all rounded-md bg-white px-3 py-1.5 font-mono text-base tracking-wider text-gray-900 ring-1 ring-brand-teal/30">{value}</span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            navigator.clipboard.writeText(value).then(
              () => setCopied(true),
              () => setCopied(false)
            )
          }
        >
          <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </StatusLine>
  );
}

function RoleChoices({ selected, error }: { selected: string[]; error?: string }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-gray-900">Roles</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {ROLES.map((r) => (
          <label
            key={r}
            className="flex cursor-pointer gap-3 rounded-lg border border-gray-300 p-3 has-[:checked]:border-brand-teal-dark has-[:checked]:bg-brand-teal-light/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal"
          >
            <input type="checkbox" name="roles" value={r} defaultChecked={selected.includes(r)} className="mt-0.5 h-4 w-4 accent-brand-teal-dark" />
            <span>
              <span className="block text-sm font-semibold text-gray-900">{ROLE_INFO[r].label}</span>
              <span className="block text-xs text-gray-500">{ROLE_INFO[r].description}</span>
            </span>
          </label>
        ))}
      </div>
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p>}
    </fieldset>
  );
}

function feOf(state: ActionResult | undefined) {
  return state && !state.ok ? (state.fieldErrors ?? {}) : {};
}

function AddUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, onSubmit, pending] = useFormAction(createUserAction);
  const fe = feOf(state);
  const done = state?.ok && state.oneTimePassword;
  return (
    <Dialog open={open} onClose={onClose} title="Add a person" subtitle="They sign in with this email, a one-time password and an authenticator app." wide>
      {done ? (
        <div className="space-y-4">
          <StatusLine tone="success">{state.message}</StatusLine>
          <OneTimePassword value={state.oneTimePassword!} />
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          {state && !state.ok && state.error && <StatusLine tone="error">{state.error}</StatusLine>}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="new-name" label="Full name" error={fe.name}>
              <Input id="new-name" name="name" required error={fe.name} />
            </Field>
            <Field id="new-email" label="Email" error={fe.email}>
              <Input id="new-email" name="email" type="email" required error={fe.email} />
            </Field>
          </div>
          <RoleChoices selected={[]} error={fe.roles} />
          <Field id="new-licence" label="Licence number" hint="Needed for signatories. Printed on reports they release." error={fe.licenceNo}>
            <Input id="new-licence" name="licenceNo" hasHint className="font-mono" error={fe.licenceNo} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Adding…' : 'Add person'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

type Step = 'reset-password' | 'reset-authenticator' | 'unlock' | 'switch-off' | 'switch-on';

const STEP_CONFIRM: Record<Step, { title: string; body: string; button: string; danger?: boolean }> = {
  'reset-password': {
    title: 'Reset their password?',
    body: 'They are signed out everywhere and get a one-time password, which they replace at next sign-in.',
    button: 'Reset password',
  },
  'reset-authenticator': {
    title: 'Reset their authenticator?',
    body: 'Use this when they lost or changed phones. They are signed out and set up the app again at next sign-in.',
    button: 'Reset authenticator',
  },
  unlock: { title: 'Unlock their account?', body: 'They can try signing in again straight away.', button: 'Unlock' },
  'switch-off': {
    title: 'Switch off this account?',
    body: 'They are signed out everywhere and can’t sign in. Their name stays on everything they did. You can switch it back on.',
    button: 'Switch off',
    danger: true,
  },
  'switch-on': { title: 'Switch this account back on?', body: 'They can sign in again with their current password.', button: 'Switch on' },
};

function ManageDialog({ row, onClose }: { row: UserRow; onClose: () => void }) {
  const [state, onSubmit, pending] = useFormAction(updateUserAction.bind(null, row.id));
  const [confirm, setConfirm] = useState<Step | null>(null);
  const [stepResult, setStepResult] = useState<ActionResult | null>(null);
  const [stepPending, startStep] = useTransition();
  const fe = feOf(state);

  const runStep = (step: Step) =>
    startStep(async () => {
      setStepResult(await accountStepAction(row.id, step));
      setConfirm(null);
    });

  if (confirm) {
    const c = STEP_CONFIRM[confirm];
    return (
      <Dialog open onClose={() => setConfirm(null)} title={c.title} subtitle={row.name}>
        <div className="space-y-5">
          <p className="text-sm text-gray-600">{c.body}</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Back
            </Button>
            <Button variant={c.danger ? 'destructive' : 'primary'} disabled={stepPending} onClick={() => runStep(confirm)}>
              {stepPending ? 'Working…' : c.button}
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} title={row.name} subtitle={row.email} wide>
      <div className="space-y-6">
        {stepResult?.ok && stepResult.message && <StatusLine tone="success">{stepResult.message}</StatusLine>}
        {stepResult && !stepResult.ok && stepResult.error && <StatusLine tone="error">{stepResult.error}</StatusLine>}
        {stepResult?.ok && stepResult.oneTimePassword && <OneTimePassword value={stepResult.oneTimePassword} />}

        <form onSubmit={onSubmit} className="space-y-5">
          {state?.ok && state.message && <StatusLine tone="success">{state.message}</StatusLine>}
          {state && !state.ok && state.error && <StatusLine tone="error">{state.error}</StatusLine>}
          <Field id={`name-${row.id}`} label="Full name" error={fe.name}>
            <Input id={`name-${row.id}`} name="name" defaultValue={row.name} required error={fe.name} />
          </Field>
          <RoleChoices selected={row.roles} error={fe.roles} />
          <Field id={`licence-${row.id}`} label="Licence number" error={fe.licenceNo}>
            <Input id={`licence-${row.id}`} name="licenceNo" defaultValue={row.licenceNo} className="font-mono" error={fe.licenceNo} />
          </Field>
          <div className="flex items-center justify-end gap-3">
            <span className="text-xs text-gray-500">{row.isMe ? '' : 'A change of role signs them out.'}</span>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>

        {!row.isMe && (
          <section className="space-y-3 border-t border-gray-200 pt-5">
            <h3 className="text-sm font-bold tracking-tight text-gray-900">Signing in and access</h3>
            <div className="flex flex-wrap gap-2">
              {row.state === 'locked' && (
                <Button variant="secondary" size="sm" onClick={() => setConfirm('unlock')}>
                  Unlock
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => setConfirm('reset-password')}>
                Reset password
              </Button>
              {row.state !== 'not-set-up' && (
                <Button variant="secondary" size="sm" onClick={() => setConfirm('reset-authenticator')}>
                  Reset authenticator
                </Button>
              )}
              {row.state === 'off' ? (
                <Button variant="secondary" size="sm" onClick={() => setConfirm('switch-on')}>
                  Switch on
                </Button>
              ) : (
                <Button variant="secondary" size="sm" className="hover:border-red-600 hover:text-red-700" onClick={() => setConfirm('switch-off')}>
                  Switch off
                </Button>
              )}
            </div>
          </section>
        )}
        {row.isMe && <p className="text-sm text-gray-500">You can&apos;t change your own access here. Use Change password in your menu.</p>}
      </div>
    </Dialog>
  );
}

export function UsersClient({ rows, subtitle }: { rows: UserRow[]; subtitle: string }) {
  const [adding, setAdding] = useState(false);
  const [addKey, setAddKey] = useState(0);
  const [managing, setManaging] = useState<UserRow | null>(null);

  return (
    <>
      <PageHeader
        title="Users"
        subtitle={subtitle}
        actions={
          <Button
              onClick={() => {
                setAddKey((k) => k + 1);
                setAdding(true);
              }}
            >
              <UserPlus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Add person
              </Button>
        }
      />
      <Panel className="overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 border-b border-gray-200 bg-gray-50/60 px-5 py-2.5 text-xs font-semibold text-gray-600 md:grid">
          <span>Person</span>
          <span>Roles</span>
          <span>State</span>
          <span>Last sign-in</span>
          <span className="sr-only">Actions</span>
        </div>
        <ul className="divide-y divide-gray-100">
          {rows.map((r) => (
            <li key={r.id} className="grid grid-cols-1 gap-2 px-5 py-3.5 hover:bg-gray-50 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center md:gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-100 text-sm font-semibold text-gray-700" aria-hidden="true">
                  {initials(r.name)}
                </span>
                <div className="min-w-0">
                  <p className={`truncate text-sm font-semibold ${r.state === 'off' ? 'text-gray-600' : 'text-gray-900'}`}>
                    {r.name} {r.isMe && <span className="ml-1 text-xs font-medium text-gray-500">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-gray-500">{r.email}</p>
                </div>
              </div>
              <p className="text-sm text-gray-700">{r.roles.filter(isRole).map((x) => ROLE_INFO[x].label).join(', ')}</p>
              <div>
                <Badge tone={STATE_BADGE[r.state].tone}>{STATE_BADGE[r.state].label}</Badge>
                {r.state === 'locked' && r.lockedUntil && (
                  <p className="mt-1 text-xs text-amber-800">
                    until <Mono>{manila(r.lockedUntil, { hour: 'numeric', minute: '2-digit' })}</Mono>
                  </p>
                )}
              </div>
              <p className="text-sm text-gray-600">
                <Mono>{lastSignIn(r.lastLoginAt)}</Mono>
              </p>
              <div className="md:text-right">
                <Button variant="secondary" size="sm" onClick={() => setManaging(r)} aria-label={`Manage ${r.name}`}>
                  Manage
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
      <AddUserDialog key={addKey} open={adding} onClose={() => setAdding(false)} />
      {managing && <ManageDialog key={managing.id} row={managing} onClose={() => setManaging(null)} />}
    </>
  );
}
