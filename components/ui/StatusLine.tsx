import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';

// Successes and failures are reported in a status line under the title, never alert().
export type StatusTone = 'success' | 'warning' | 'error' | 'info';

const tones: Record<StatusTone, { cls: string; Icon: typeof Info }> = {
  success: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-800', Icon: CheckCircle2 },
  warning: { cls: 'border-amber-200 bg-amber-50 text-amber-800', Icon: AlertTriangle },
  error: { cls: 'border-red-200 bg-red-50 text-red-700', Icon: XCircle },
  info: { cls: 'border-brand-teal/30 bg-brand-teal-light text-brand-teal-deep', Icon: Info },
};

export function StatusLine({ tone, children, onDismiss }: { tone: StatusTone; children: React.ReactNode; onDismiss?: () => void }) {
  const { cls, Icon } = tones[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${cls}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="rounded text-xs font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
