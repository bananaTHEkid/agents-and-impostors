import React, { useEffect, useState } from 'react';
import { Form } from 'react-bootstrap';
import type { OperationRendererProps } from '@/types';

const MultiChoiceRenderer: React.FC<OperationRendererProps> = ({ operation, username, disabled, onSubmit }) => {
  const info = operation?.info || {};
  const optionsAll: string[] = Array.isArray(info.availablePlayers) ? info.availablePlayers : [];
  // Keep panel focused on input only
  // Ensure the receiving player is not an option
  const options: string[] = optionsAll.filter(p => p !== username);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const selectedCount = Object.keys(selected).filter(k => selected[k]).length;

  // Reset selection when options change (e.g., when operation is refreshed)
  useEffect(() => {
    setSelected({});
    // only re-initialize when the options change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.join('|')]);

  const toggle = (name: string) => {
    if (disabled) return;
    setSelected(prev => {
      const currentlySelected = !!prev[name];
      const count = Object.keys(prev).filter(k => prev[k]).length;
      // If trying to select a third, ignore
      if (!currentlySelected && count >= 2) return prev;
      // Otherwise toggle
      return { ...prev, [name]: !currentlySelected };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const picks = Object.keys(selected).filter(k => selected[k]);
    if (picks.length !== 2) return;
    // Match server-side expected field names for secret intel
    onSubmit?.({ targetPlayer1: picks[0], targetPlayer2: picks[1] });
  };

  return (
    <Form onSubmit={handleSubmit} className="mt-3">
      <div className="mb-2">
        {options.map(p => (
          <Form.Check
            key={p}
            type="checkbox"
            id={`chk-${p}`}
            label={p}
            checked={!!selected[p]}
            onChange={() => toggle(p)}
            disabled={disabled || (!selected[p] && selectedCount >= 2)}
            className="mb-1"
          />
        ))}
      </div>
      <button
        data-testid="operation-submit"
        type="submit"
        disabled={disabled || selectedCount !== 2}
        className="inline-flex items-center justify-center bg-indigo-600 text-white hover:bg-indigo-700 px-3 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Bestätigen
      </button>
      {options.length < 2 && (
        <div className="text-muted small mt-2">Nicht genügend Spieler verfügbar, um zwei Ziele auszuwählen.</div>
      )}
    </Form>
  );
};

export default MultiChoiceRenderer;
