import React from 'react';
import type { OperationRendererProps } from '@/types';

const ConfirmationRenderer: React.FC<OperationRendererProps> = ({ operation, onSubmit, disabled }) => {
  if (!operation) return null;
  const info = operation.info || {};
  return (
    <div className="mt-3">
      {info.message && <p>{info.message}</p>}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSubmit?.({ confirmed: true })}
        className="inline-flex items-center justify-center bg-indigo-600 text-white hover:bg-indigo-700 px-3 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Bestätigen
      </button>
    </div>
  );
};

export default ConfirmationRenderer;
