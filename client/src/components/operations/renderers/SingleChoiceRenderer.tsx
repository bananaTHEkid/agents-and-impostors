import React, { useState } from 'react';
import type { OperationRendererProps } from '@/types';

const SingleChoiceRenderer: React.FC<OperationRendererProps> = ({ operation, username, disabled, onSubmit }) => {
  const [choice, setChoice] = useState<string>('');
  if (!operation) return null;
  const info = operation.info || {};
  const options: string[] = Array.isArray(info.availablePlayers) ? info.availablePlayers : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!choice || disabled) return;
    onSubmit?.({ targetPlayer: choice });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3">
      <p className="text-sm text-gray-800">Wähle einen Spieler aus.</p>
      <div className="space-y-2">
        {options
          .filter((p) => p !== username)
          .map((p) => {
            const selected = choice === p;
            const isDisabled = disabled;
            return (
              <button
                key={p}
                type="button"
                disabled={isDisabled}
                onClick={() => !isDisabled && setChoice(p)}
                className={
                  "w-full text-left flex items-center justify-between px-4 py-3 rounded-lg border transition-colors " +
                  (selected ? "border-indigo-500 ring-2 ring-indigo-200 bg-indigo-50 " : "border-gray-200 bg-white ") +
                  (isDisabled ? "cursor-not-allowed opacity-60" : "hover:bg-gray-50")
                }
                aria-pressed={selected}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-medium">
                    {p.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium text-gray-800">{p}</span>
                </div>
                {selected && <span className="text-sm text-indigo-700 font-semibold">Gewählt</span>}
              </button>
            );
          })}
        {!options.length && (
          <div className="text-sm text-gray-500">Keine Spieler verfügbar.</div>
        )}
      </div>

      <button
        data-testid="operation-submit"
        type="submit"
        disabled={disabled || !choice}
        className="inline-flex items-center justify-center bg-indigo-600 text-white hover:bg-indigo-700 px-3 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Bestätigen
      </button>
    </form>
  );
};

export default SingleChoiceRenderer;
