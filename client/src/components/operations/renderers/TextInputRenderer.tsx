import React, { useState } from 'react';
import { Form, Button } from 'react-bootstrap';
import type { OperationRendererProps } from '@/types';

const TextInputRenderer: React.FC<OperationRendererProps> = ({ operation, disabled, onSubmit }) => {
  const info = operation?.info || {};
  const [text, setText] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSubmit?.({ message: text.trim() });
    setText('');
  };

  return (
    <Form onSubmit={handleSubmit} className="mt-3">
      {info.message && <p>{info.message}</p>}
      <Form.Group className="mb-2">
        <Form.Control as="textarea" rows={3} value={text} onChange={(e) => setText(e.target.value)} disabled={disabled} placeholder="Enter your message..." />
      </Form.Group>
      <Button type="submit" disabled={disabled || !text.trim()}>Send</Button>
    </Form>
  );
};

export default TextInputRenderer;
