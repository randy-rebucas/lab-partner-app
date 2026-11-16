import Link from 'next/link';
import type { ComponentProps } from 'react';

// DESIGN.md "Buttons": 6px corners; primary teal-dark (hover teal-deep); secondary white with a
// gray-300 hairline; ghost for icons; destructive red-600 is the only non-teal filled button.
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'md' | 'sm' | 'icon';

const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap transition-colors duration-150 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-teal-dark text-white hover:bg-brand-teal-deep',
  secondary: 'bg-white text-gray-900 border border-gray-300 hover:border-gray-900',
  ghost: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
  destructive: 'bg-red-600 text-white hover:bg-red-700',
};

const sizes: Record<ButtonSize, string> = {
  md: 'px-5 py-2.5 text-sm',
  sm: 'px-3 py-2 text-sm',
  icon: 'h-9 w-9 text-sm',
};

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra = ''): string {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`.trim();
}

type ButtonProps = ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize };

export function Button({ variant = 'primary', size = 'md', className = '', type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize };

export function ButtonLink({ variant = 'primary', size = 'md', className = '', ...props }: ButtonLinkProps) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
