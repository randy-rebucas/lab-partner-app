'use client';

import { useEffect, useId, useRef } from 'react';

/**
 * A confirmation built on the native <dialog> element: showModal() traps focus, makes the page
 * inert, and closes on Escape. Consequential steps say what follows in `description`.
 * Portal-free on purpose: <dialog> renders in the top layer, so no ancestor transform can trap it.
 */
export function AlertDialog({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  /** The footer buttons: Back first, then the one confirm button. */
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-gray-200 bg-white p-0 text-gray-900 shadow-[0_20px_50px_rgb(15_23_42/0.18)]"
    >
      {open && (
        <div className="space-y-4 p-6">
          <h2 id={titleId} className="text-base font-bold tracking-tight">
            {title}
          </h2>
          {description && (
            <div id={descId} className="space-y-2 text-sm text-gray-600">
              {description}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2 pt-2">{children}</div>
        </div>
      )}
    </dialog>
  );
}
