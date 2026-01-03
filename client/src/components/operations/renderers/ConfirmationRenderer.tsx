import React from 'react';
import { Button } from 'react-bootstrap';
import type { OperationRendererProps } from '@/types';

const ConfirmationRenderer: React.FC<OperationRendererProps> = ({ operation, onSubmit, disabled }) => {
  if (!operation) return null;
  const info = operation.info || {};
  return (
    <div className="mt-3">
      {info.message && <p>{info.message}</p>}
      <Button disabled={disabled} onClick={() => onSubmit?.({ confirmed: true })}>Bestätigen</Button>
    </div>
  );
};

export default ConfirmationRenderer;
