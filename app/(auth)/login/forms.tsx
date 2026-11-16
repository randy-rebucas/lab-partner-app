'use client';

import { useFormAction } from '@/components/ui/useFormAction';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { StatusLine } from '@/components/ui/StatusLine';
import { changePasswordAction, confirmSetupAction, signInAction, verifyCodeAction, type FormState } from './actions';

function FormError({ state }: { state: FormState }) {
  return state?.error ? <StatusLine tone="error">{state.error}</StatusLine> : null;
}

export function SignInForm() {
  const [state, onSubmit, pending] = useFormAction(signInAction);
  const fe = state?.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <FormError state={state} />
      <Field id="email" label="Email" error={fe.email}>
        <Input id="email" type="email" autoComplete="username" required autoFocus error={fe.email} />
      </Field>
      <Field id="password" label="Password" error={fe.password}>
        <Input id="password" type="password" autoComplete="current-password" required error={fe.password} />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Checking…' : 'Continue'}
      </Button>
    </form>
  );
}

function CodeField({ error }: { error?: string }) {
  return (
    <Field id="code" label="6-digit code" error={error}>
      <Input
        id="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={7}
        required
        autoFocus
        error={error}
        className="font-mono text-lg tracking-[0.3em]"
      />
    </Field>
  );
}

export function VerifyCodeForm() {
  const [state, onSubmit, pending] = useFormAction(verifyCodeAction);
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <FormError state={state} />
      <CodeField error={state?.fieldErrors?.code} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Checking…' : 'Sign in'}
      </Button>
    </form>
  );
}

export function ConfirmSetupForm() {
  const [state, onSubmit, pending] = useFormAction(confirmSetupAction);
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <FormError state={state} />
      <CodeField error={state?.fieldErrors?.code} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Checking…' : 'Turn on and sign in'}
      </Button>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, onSubmit, pending] = useFormAction(changePasswordAction);
  const fe = state?.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <FormError state={state} />
      <Field id="current" label="Current password" error={fe.current}>
        <Input id="current" type="password" autoComplete="current-password" required error={fe.current} />
      </Field>
      <Field id="password" label="New password" hint="At least 12 characters. A short sentence works well." error={fe.password}>
        <Input id="password" type="password" autoComplete="new-password" required hasHint error={fe.password} />
      </Field>
      <Field id="confirm" label="New password again" error={fe.confirm}>
        <Input id="confirm" type="password" autoComplete="new-password" required error={fe.confirm} />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Saving…' : 'Save password'}
      </Button>
    </form>
  );
}
