'use client';

import { startTransition, useActionState, type FormEvent } from 'react';

/**
 * Like useActionState, but the form keeps what the person typed when the server refuses it.
 * (React 19 resets a form after an action passed to <form action>; submitting from onSubmit
 * inside a transition does not.) Use: <form onSubmit={onSubmit}>.
 */
export function useFormAction<S>(action: (prev: Awaited<S>, formData: FormData) => Promise<S>) {
  // Every action here accepts `undefined` as its first state.
  const [state, dispatch, pending] = useActionState<S, FormData>(action, undefined as Awaited<S>);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Include the clicked button's name/value, so a form can have two submit buttons.
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const formData = new FormData(event.currentTarget, submitter?.name ? submitter : null);
    startTransition(() => dispatch(formData));
  };
  return [state, onSubmit, pending] as const;
}
