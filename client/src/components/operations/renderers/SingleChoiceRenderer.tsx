import React, { useState } from 'react';
import { Form } from 'react-bootstrap';
import type { OperationRendererProps } from '@/types';

const SingleChoiceRenderer: React.FC<OperationRendererProps> = ({ operation, username, disabled, onSubmit }) => {
  const [choice, setChoice] = useState<string>('');
  if (!operation) return null;
  const info = operation.info || {};
  const options: string[] = Array.isArray(info.availablePlayers) ? info.availablePlayers : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!choice) return;
    onSubmit?.({ targetPlayer: choice });
  };

  return (
    <Form onSubmit={handleSubmit} className="mt-3">
      <Form.Group className="mb-2">
        <Form.Label>Spieler wählen:</Form.Label>
        <Form.Select data-testid="operation-choose-player" value={choice} onChange={(e) => setChoice(e.target.value)} required disabled={disabled}>
          <option value="">Spieler auswählen</option>
          {options.filter(p => p !== username).map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </Form.Select>
      </Form.Group>
      <button
        data-testid="operation-submit"
        type="submit"
        disabled={disabled || !choice}
        className="inline-flex items-center justify-center bg-indigo-600 text-white hover:bg-indigo-700 px-3 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Bestätigen
      </button>
    </Form>
  );
};

export default SingleChoiceRenderer;
