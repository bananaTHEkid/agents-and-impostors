import React, { useState } from 'react';
import { Form, Button } from 'react-bootstrap';
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
      {info.message && <p>{info.message}</p>}
      <Form.Group className="mb-2">
        <Form.Label>Choose a player:</Form.Label>
        <Form.Select value={choice} onChange={(e) => setChoice(e.target.value)} required disabled={disabled}>
          <option value="">Select a player</option>
          {options.filter(p => p !== username).map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </Form.Select>
      </Form.Group>
      <Button type="submit" disabled={disabled || !choice} size="sm">Submit</Button>
    </Form>
  );
};

export default SingleChoiceRenderer;
