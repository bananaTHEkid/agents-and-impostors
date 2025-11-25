import React, { useState } from 'react';
import { Form, Button } from 'react-bootstrap';
import type { OperationRendererProps } from '@/types';

const MultiChoiceRenderer: React.FC<OperationRendererProps> = ({ operation, username, disabled, onSubmit }) => {
  const info = operation?.info || {};
  const options: string[] = Array.isArray(info.availablePlayers) ? info.availablePlayers : [];
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const toggle = (name: string) => {
    setSelected(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const picks = Object.keys(selected).filter(k => selected[k]);
    onSubmit?.({ targets: picks });
  };

  return (
    <Form onSubmit={handleSubmit} className="mt-3">
      {info.message && <p>{info.message}</p>}
      <div className="mb-2">
        {options.filter(p => p !== username).map(p => (
          <Form.Check
            key={p}
            type="checkbox"
            id={`chk-${p}`}
            label={p}
            checked={!!selected[p]}
            onChange={() => toggle(p)}
            disabled={disabled}
            className="mb-1"
          />
        ))}
      </div>
      <Button type="submit" disabled={disabled}>Submit</Button>
    </Form>
  );
};

export default MultiChoiceRenderer;
