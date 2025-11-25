import React from 'react';
import { Alert } from 'react-bootstrap';
import type { OperationRendererProps } from '@/types';

const NoInputRenderer: React.FC<OperationRendererProps> = ({ operation }) => {
  if (!operation) return null;
  const info = operation.info || {};
  return (
    <Alert variant="info">
      <h5 className="mb-2">Your Operation: {operation.name}</h5>
      {info.message && <p>{info.message}</p>}
      {/* Render any known informational details */}
      {info.grudgeTarget && <p><strong>Grudge Target:</strong> {info.grudgeTarget}</p>}
      {info.revealedPlayers && Array.isArray(info.revealedPlayers) && (
        <p><strong>Revealed:</strong> {info.revealedPlayers.join(' and ')}</p>
      )}
    </Alert>
  );
};

export default NoInputRenderer;
