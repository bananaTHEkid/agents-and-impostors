import React, { useState } from 'react';
import type { OperationRendererProps } from '@/types';
import { getOperationEntry } from './operationRegistry';
import NoInputRenderer from './renderers/NoInputRenderer';

const OperationPanel: React.FC<OperationRendererProps> = ({ operation, lobbyCode, username, socket, isMyTurn }) => {
  const [submitting, setSubmitting] = useState(false);
  if (!operation) return null;

  const entry = getOperationEntry(operation.name);
  // Choose renderer: fallback to NoInputRenderer
  const Renderer = entry?.renderer || NoInputRenderer;

  const handleSubmit = async (payload: Record<string, any>) => {
    // Prevent submission if socket missing or not this player's turn
    if (!socket) return;
    if (isMyTurn === false) {
      // Optionally, inform user locally that it's not their turn
      return;
    }
    setSubmitting(true);
    try {
      // Prefer specific eventName when registry defines it
      const eventName = entry?.eventName || 'operation-used';
      // Special-case: if renderer indicates this is an acceptance of an assignment
      // (payload.accepted === true) use the dedicated `accept-assignment` event so
      // server-side handlers can treat it distinctly.
      if (payload && (payload as any).accepted) {
        // Emit and keep submitting=true until server acks with 'assignment-accepted'.
        // GameRoom will mark operation.used on ack which permanently disables controls.
        socket.emit('accept-assignment', { lobbyCode, username });
        return;
      }

      const emitPayload = { lobbyCode, operation: operation.name, payload };
      socket.emit(eventName, emitPayload);
    } catch (err) {
      console.error('Operation submit error', err);
    } finally {
      // For non-accept flows, release submitting immediately; accept flows return earlier.
      setSubmitting(false);
    }
  };

  const isAllowed = !operation.used && !submitting && (isMyTurn === undefined || isMyTurn === true);
  const availablePlayers = Array.isArray(operation.info?.availablePlayers) ? operation.info.availablePlayers : [];
  const targetCount = entry?.renderer?.name === 'MultiChoiceRenderer' ? 2 : availablePlayers.length ? 1 : 0;
  const instruction = targetCount === 2
    ? 'Wähle genau 2 Spieler aus und bestätige anschließend.'
    : targetCount === 1
      ? 'Wähle 1 Spieler aus und bestätige anschließend.'
      : 'Lies deine Information und bestätige, sobald du bereit bist.';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="bg-indigo-50 p-3 border-b border-indigo-100">
        <h4 className="text-base font-semibold text-gray-800 m-0">Operation</h4>
      </div>
      <div className="p-4">
        <p className="mb-3 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
          {instruction}
        </p>
        <Renderer
          operation={operation}
          lobbyCode={lobbyCode}
          username={username}
          socket={socket}
          onSubmit={handleSubmit}
          disabled={!isAllowed}
        />
        {!isAllowed && isMyTurn === false && (
          <div className="text-sm text-gray-500 mt-2">Du bist nicht an der Reihe — warte auf den aktuellen Spieler.</div>
        )}
      </div>
    </div>
  );
};

export default OperationPanel;
