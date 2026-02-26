import { ReactNode } from 'react';

export const Label = ({ children, htmlFor, className = '' }: { children: ReactNode; htmlFor?: string; className?: string }) => (
  <label htmlFor={htmlFor} className={`block text-sm font-semibold text-gray-800 ${className}`}>
    {children}
  </label>
); 