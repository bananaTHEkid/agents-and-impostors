import { ReactNode } from 'react';

type AlertVariant = 'default' | 'destructive' | 'info' | 'success';

export const Alert = ({
  children,
  className = '',
  variant = 'default',
  onClose,
  dismissible,
}: {
  children: ReactNode;
  className?: string;
  variant?: AlertVariant;
  onClose?: () => void;
  dismissible?: boolean;
}) => {
  const variants: Record<AlertVariant, string> = {
    default: 'bg-blue-50 border-blue-200 text-blue-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    destructive: 'bg-red-50 border-red-200 text-red-800',
    success: 'bg-green-50 border-green-200 text-green-800',
  };

  return (
    <div className={`relative border rounded-md p-4 shadow-sm ${variants[variant]} ${className}`}>
      {dismissible && onClose && (
        <button
          type="button"
          aria-label="Close alert"
          onClick={onClose}
          className="absolute top-2 right-2 text-current/80 hover:text-current transition-colors"
        >
          ×
        </button>
      )}
      {children}
    </div>
  );
};

export const AlertTitle = ({ children }: { children: ReactNode }) => (
  <h5 className="font-medium mb-1">{children}</h5>
);

export const AlertDescription = ({ children }: { children: ReactNode }) => (
  <div className="text-sm leading-relaxed">{children}</div>
); 