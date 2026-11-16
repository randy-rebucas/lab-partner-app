'use client';

import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

/** A form or detail dialog on the native <dialog> element (focus trap, Escape, top layer). */
export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={`m-auto max-h-[90vh] w-[calc(100%-2rem)] ${wide ? 'max-w-2xl' : 'max-w-lg'} overflow-y-auto rounded-lg border border-gray-200 bg-white p-0 text-gray-900 shadow-[0_20px_50px_rgb(15_23_42/0.18)]`}
    >
      {open && (
        <>
          <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-6 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-bold tracking-tight">
                {title}
              </h2>
              {subtitle && <div className="mt-0.5 text-sm text-gray-600">{subtitle}</div>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
            >
              <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </header>
          <div className="px-6 py-5">{children}</div>
        </>
      )}
    </dialog>
  );
}
