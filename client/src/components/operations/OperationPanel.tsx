import React, { useState } from 'react';
import { Alert } from 'react-bootstrap';
import type { OperationRendererProps } from '@/types';
import { getOperationEntry } from './operationRegistry';
import NoInputRenderer from './renderers/NoInputRenderer';

const OperationPanel: React.FC<OperationRendererProps> = ({ operation, lobbyCode, username, socket }) => {
  const [submitting, setSubmitting] = useState(false);
  if (!operation) return null;

  const entry = getOperationEntry(operation.name);
  // Choose renderer: fallback to NoInputRenderer
  const Renderer = entry?.renderer || NoInputRenderer;

  const handleSubmit = async (payload: Record<string, any>) => {
    if (!socket) return;
    setSubmitting(true);
    try {
      // Prefer specific eventName when registry defines it
      const eventName = entry?.eventName || 'operation-used';
      const emitPayload = { lobbyCode, operation: operation.name, payload };
      socket.emit(eventName, emitPayload);
    } catch (err) {
      console.error('Operation submit error', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Alert variant="info" className="mb-0">
        <Renderer operation={operation} lobbyCode={lobbyCode} username={username} socket={socket} onSubmit={handleSubmit} disabled={!!operation.used || submitting} />
      </Alert>
    </div>
  );
};

export default OperationPanel;
