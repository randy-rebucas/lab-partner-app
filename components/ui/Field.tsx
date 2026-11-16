import type { ComponentProps } from 'react';

// DESIGN.md "Inputs / Fields": white, gray-300 hairline, 8px corners, 2px brand-teal focus ring.
// Errors keep a red ring and a red-50 message block.
export const inputClass =
  'block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 ' +
  'focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-teal ' +
  'disabled:bg-gray-50 disabled:text-gray-500 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-red-500';

type FieldProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
};

/** Label, control, hint and error, wired together for screen readers. */
export function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-gray-900">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-gray-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(id: string, hint?: boolean, error?: boolean) {
  return [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
}

type InputProps = ComponentProps<'input'> & { id: string; hasHint?: boolean; error?: string };

export function Input({ id, hasHint, error, className = '', ...props }: InputProps) {
  return (
    <input
      id={id}
      name={props.name ?? id}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(id, hasHint, !!error)}
      className={`${inputClass} ${className}`}
      {...props}
    />
  );
}

type SelectProps = ComponentProps<'select'> & { id: string; error?: string };

export function Select({ id, error, className = '', children, ...props }: SelectProps) {
  return (
    <select
      id={id}
      name={props.name ?? id}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      className={`${inputClass} ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

type TextareaProps = ComponentProps<'textarea'> & { id: string; error?: string };

export function Textarea({ id, error, className = '', ...props }: TextareaProps) {
  return (
    <textarea
      id={id}
      name={props.name ?? id}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      className={`${inputClass} ${className}`}
      {...props}
    />
  );
}
