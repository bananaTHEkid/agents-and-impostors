import React from 'react';
import { Alert } from 'react-bootstrap';
import type { OperationRendererProps } from '@/types';

const NoInputRenderer: React.FC<OperationRendererProps> = ({ operation, username: _username, myTeam, onSubmit, disabled }) => {
  if (!operation) return null;
  const info = operation.info || {};
  const revealed = (info && (info as any).revealed) || null;
  return (
    <Alert variant="info">
      <div className="d-flex justify-content-between align-items-start mb-2">
        <div>
          <h5 className="mb-1">Your Operation: {operation.name}</h5>
          {info.message && <p className="mb-1">{info.message}</p>}
        </div>
        <div className="text-right">
          {myTeam && (
            <div className={`badge ${myTeam === 'impostor' ? 'bg-danger' : 'bg-success'} text-white`}>{myTeam === 'impostor' ? 'Impostor' : 'Agent'}</div>
          )}
        </div>
      </div>

      {/* Render any known informational details */}
      {info.grudgeTarget && <p><strong>Grudge Target:</strong> {info.grudgeTarget}</p>}
      {info.revealedPlayers && Array.isArray(info.revealedPlayers) && (
        <p><strong>Revealed:</strong> {info.revealedPlayers.join(' and ')}</p>
      )}
      {revealed && (
        <div className="mt-2">
          {revealed.message && <p className="mb-1">{revealed.message}</p>}
          {(revealed.target1Name || revealed.target2Name) && (
            <ul className="mb-2">
              {revealed.target1Name && (
                <li>
                  {revealed.target1Name}: {revealed.target1Team}
                </li>
              )}
              {revealed.target2Name && (
                <li>
                  {revealed.target2Name}: {revealed.target2Team}
                </li>
              )}
            </ul>
          )}
        </div>
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
