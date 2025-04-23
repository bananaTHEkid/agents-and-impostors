import { ReactNode, ButtonHTMLAttributes } from 'react';

export const Button = ({ children, className, variant = 'default', ...props }: { children: ReactNode; className?: string; variant?: 'default' | 'outline' } & ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button className={`${variant === 'outline' ? 'border border-gray-300 hover:bg-gray-100' : 'bg-blue-600 text-white hover:bg-blue-700'} px-4 py-2 rounded-md ${className}`} {...props}>
    {children}
  </button>
);