import React, { useEffect, useState } from 'react';
import type { OperationRendererProps } from '@/types';

const MultiChoiceRenderer: React.FC<OperationRendererProps> = ({ operation, username, disabled, onSubmit }) => {
  const info = operation?.info || {};
  const optionsAll: string[] = Array.isArray(info.availablePlayers) ? info.availablePlayers : [];
  const options: string[] = optionsAll.filter((p) => p !== username);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const selectedCount = Object.keys(selected).filter((k) => selected[k]).length;

  useEffect(() => {
    setSelected({});
  }, [options.join('|')]);

  const toggle = (name: string) => {
    if (disabled) return;
    setSelected((prev) => {
      const currentlySelected = !!prev[name];
      const count = Object.keys(prev).filter((k) => prev[k]).length;
      if (!currentlySelected && count >= 2) return prev; // ignore third selection
      return { ...prev, [name]: !currentlySelected };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const picks = Object.keys(selected).filter((k) => selected[k]);
    if (disabled || picks.length !== 2) return;
    onSubmit?.({ targetPlayer1: picks[0], targetPlayer2: picks[1] });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3">
      <p className="text-sm text-gray-800">Wähle zwei Spieler aus.</p>
      <div className="space-y-2">
        {options.map((p) => {
          const isChecked = !!selected[p];
          const lockOut = !isChecked && selectedCount >= 2;
          const isDisabled = disabled || lockOut;
          return (
            <button
              key={p}
              type="button"
              disabled={isDisabled}
              onClick={() => toggle(p)}
              className={
                "w-full text-left flex items-center justify-between px-4 py-3 rounded-lg border transition-colors " +
                (isChecked ? "border-indigo-500 ring-2 ring-indigo-200 bg-indigo-50 " : "border-gray-200 bg-white ") +
                (isDisabled && !isChecked ? "cursor-not-allowed opacity-60" : "hover:bg-gray-50")
              }
              aria-pressed={isChecked}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-linear-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-medium">
                  {p.charAt(0).toUpperCase()}
                </div>
                <span className="font-medium text-gray-800">{p}</span>
              </div>
              {isChecked && <span className="text-sm text-indigo-700 font-semibold">Gewählt</span>}
            </button>
          );
        })}
        {!options.length && (
          <div className="text-sm text-gray-500">Nicht genügend Spieler verfügbar.</div>
        )}
      </div>

      <button
        data-testid="operation-submit"
        type="submit"
        disabled={disabled || selectedCount !== 2}
        className="inline-flex items-center justify-center bg-indigo-600 text-white hover:bg-indigo-700 px-3 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Bestätigen
      </button>
    </form>
  );
};

export default MultiChoiceRenderer;
