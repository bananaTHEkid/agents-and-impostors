import { ReactNode } from 'react';

export const Alert = ({ children, className, variant = 'default' }: { children: ReactNode; className?: string; variant?: 'default' | 'destructive' }) => (
  <div className={`${variant === 'destructive' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-blue-50 border-blue-200 text-blue-800'} border rounded-md p-4 ${className}`}>
    {children}
  </div>
);

export const AlertTitle = ({ children }: { children: ReactNode }) => (
  <h5 className="font-medium mb-1">{children}</h5>
);

export const AlertDescription = ({ children }: { children: ReactNode }) => (
  <div className="text-sm">{children}</div>
); 