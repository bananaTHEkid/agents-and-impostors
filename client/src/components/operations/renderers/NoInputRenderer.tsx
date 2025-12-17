import React from 'react';
import { Alert } from 'react-bootstrap';
import type { OperationRendererProps } from '@/types';

const NoInputRenderer: React.FC<OperationRendererProps> = ({ operation, username: _username, myTeam, onSubmit, disabled }) => {
  if (!operation) return null;
  const info = operation.info || {};
  // Keep panel focused on input only
  return (
    <Alert variant="info">
      <div className="mb-2">
        <h5 className="mb-1">Your Operation: {operation.name}</h5>
      </div>

      {/* Focus on input guidance only; defer reveals/messages to GameInfo post-accept */}
      {info.grudgeTarget && <p><strong>Grudge Target:</strong> {info.grudgeTarget}</p>}
      {info.revealedPlayers && Array.isArray(info.revealedPlayers) && (
        <p><strong>Revealed:</strong> {info.revealedPlayers.join(' and ')}</p>
      )}

      {/* Accept assignment button for no-input operations */}
      {!operation.used && (
        <div className="mt-3">
          <button className="btn btn-primary btn-sm" disabled={disabled} onClick={() => onSubmit?.({ accepted: true })} data-testid="accept-assignment-btn">Accept Assignment</button>
        </div>
      )}
    </Alert>
  );
};

export default NoInputRenderer;
