import React from 'react';
import type { OperationRendererProps } from '@/types';

const NoInputRenderer: React.FC<OperationRendererProps> = ({ operation, username: _username, onSubmit, disabled }) => {
  if (!operation) return null;
  const info = operation.info || {};
  // Keep panel focused on input only
  return (
    <div>
      <div className="mb-2">
        <h5 className="mb-1">Deine Operation: {operation.name}</h5>
      </div>

      {info.grudgeTarget && <p><strong>Groll-Ziel:</strong> {info.grudgeTarget}</p>}
      {info.revealedPlayers && Array.isArray(info.revealedPlayers) && (
        <p><strong>Aufgedeckt:</strong> {info.revealedPlayers.join(' und ')}</p>
      )}

      {!operation.used && (
        <div className="mt-3">
          <button
            type="button"
            className="inline-flex items-center justify-center bg-indigo-600 text-white hover:bg-indigo-700 px-3 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={disabled}
            onClick={() => onSubmit?.({ accepted: true })}
            data-testid="accept-assignment-btn"
          >
            Bestätigen
          </button>
        </div>
      )}
    </div>
  );
};

export default NoInputRenderer;
