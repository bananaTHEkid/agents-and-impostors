import { ReactNode, ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'default' | 'outline' | 'ghost';

export const Button = ({
  children,
  className = '',
  variant = 'default',
  ...props
}: { children: ReactNode; className?: string; variant?: ButtonVariant } & ButtonHTMLAttributes<HTMLButtonElement>) => {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 font-medium transition-transform duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed active:scale-95';

  const variants: Record<ButtonVariant, string> = {
    default: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow-md',
    outline: 'border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 shadow-sm',
    ghost: 'text-indigo-700 hover:bg-indigo-50',
  };

  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};