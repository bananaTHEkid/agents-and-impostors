import { ReactNode } from 'react';

export const Label = ({ children, htmlFor, className }: { children: ReactNode; htmlFor?: string; className?: string }) => (
  <label htmlFor={htmlFor} className={`block text-sm font-medium text-gray-700 ${className}`}>
    {children}
  </label>
); 