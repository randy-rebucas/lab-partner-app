// DESIGN.md "Status Badges": 4px corners, 0.75rem semibold, sentence case, a 1px inset ring of the
// same family. Colour always comes with a word, never alone.
export type BadgeTone = 'teal' | 'amber' | 'emerald' | 'red' | 'gray' | 'outline';

const tones: Record<BadgeTone, string> = {
  teal: 'bg-brand-teal-light text-brand-teal-deep ring-brand-teal/30',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  gray: 'bg-gray-100 text-gray-700 ring-gray-500/20',
  outline: 'bg-white text-gray-600 ring-gray-300',
};

export function Badge({ tone = 'gray', children, className = '' }: { tone?: BadgeTone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
