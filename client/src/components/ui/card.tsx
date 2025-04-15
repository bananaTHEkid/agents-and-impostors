import { ReactNode } from 'react';

export const Card = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={`bg-white shadow-md rounded p-6 ${className}`}>{children}</div>
);

export const CardContent = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={className}>{children}</div>
);
