import React, { useEffect, useRef, useState } from "react";

interface GameRulesModalProps {
  open: boolean;
  onClose: () => void;
}

const GameRulesModal: React.FC<GameRulesModalProps> = ({ open, onClose }) => {
  // Close on ESC when open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Operations list content
  const OPS: Array<{ key: string; label: string; desc: string }> = [
    { key: 'grudge', label: 'Groll', desc: 'Ziel aus gegnerischem Team wird bestimmt; du gewinnst, wenn dieses Ziel eliminiert wird.' },
    { key: 'infatuation', label: 'Verliebtheit', desc: 'Du bist an einen zufälligen Spieler gebunden und gewinnst nur, wenn dieser gewinnt.' },
    { key: 'scapegoat', label: 'Sündenbock', desc: 'Du gewinnst nur, wenn du herausgewählt wirst.' },
    { key: 'sleeper agent', label: 'Schläferagent', desc: 'Dein sichtbares Team kann täuschen; im Spiel wechselst du zur wahren Seite.' },
    { key: 'secret intel', label: 'Geheime Informationen', desc: 'Zwei Spieler werden geprüft; Teams werden offenbart, wenn mind. einer Hochstapler ist oder beide Agenten sind.' },
    { key: 'secret tip', label: 'Geheimer Hinweis', desc: 'Ein zufälliger Spieler und dessen Teamzugehörigkeit werden dir verraten.' },
    { key: 'confession', label: 'Beichte', desc: 'Wähle einen Spieler und offenbare ihm privat dein Team.' },
    { key: 'old photographs', label: 'Alte Fotografien', desc: 'Zeigt dir zwei Spieler, die im selben Team sind.' },
    { key: 'danish intelligence', label: 'Dänischer Geheimdienst', desc: 'Wähle zwei Spieler; je nach Kombination werden ihre Teams offenbart oder nicht.' },
    { key: 'anonymous tip', label: 'Anonymer Hinweis', desc: 'Du erhältst einen anonymen Hinweis über die Teamzugehörigkeit eines zufälligen Spielers.' },
    { key: 'unfortunate encounter', label: 'Unglückliche Begegnung', desc: 'Wähle einen Spieler; ihr beide erhaltet dieselbe Zusammenfassung einer Begegnung.' },
    { key: 'spy transfer', label: 'Agentenübertragung', desc: 'Wähle einen Spieler; du wechselst heimlich in dessen Team (ohne sein Team zu ändern).' },
  ];

  // Click-to-toggle explanation state and container refs
  const [activeOp, setActiveOp] = useState<string | null>(null);
  const chipsRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const chipBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [rows, setRows] = useState<string[][]>([]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (chipsRef.current && !chipsRef.current.contains(target)) setActiveOp(null);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  // Compute label rows based on container width and measured chip widths
  useEffect(() => {
    const computeRows = () => {
      const containerWidth = chipsRef.current?.offsetWidth || 0;
      if (!containerWidth) return;
      const gap = 8; // Tailwind gap-2
      const order = OPS.map(o => o.key);
      const widths = order.map(k => (chipBtnRefs.current[k]?.offsetWidth || 0));
      const result: string[][] = [];
      let current: string[] = [];
      let lineWidth = 0;
      for (let i = 0; i < order.length; i++) {
        const w = widths[i];
        const need = current.length ? (lineWidth + gap + w) : (lineWidth + w);
        if (need <= containerWidth) {
          current.push(order[i]);
          lineWidth = need;
        } else {
          if (current.length) result.push(current);
          current = [order[i]];
          lineWidth = w;
        }
      }
      if (current.length) result.push(current);
      setRows(result);
    };
    computeRows();
    const onResize = () => computeRows();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [OPS]);

  // Conditional render after hooks to preserve hook order
  return open ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center" aria-modal="true" role="dialog" data-testid="game-rules-modal">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-[92vw] max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-100">
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-t-2xl">
          <h3 className="text-white text-lg font-semibold">Spielregeln</h3>
          <button aria-label="Schließen" onClick={onClose} className="text-white/90 hover:text-white">✕</button>
        </div>
        <div className="p-5 space-y-4 text-gray-800">
          <p>
            Triple ist ein soziales Deduktionsspiel mit zwei Teams: <span className="font-semibold">Agenten</span> und
            <span className="font-semibold"> Hochstapler</span>. Ziel der Agenten ist es, die Hochstapler zu enttarnen; die Hochstapler wollen unentdeckt bleiben.
          </p>
          <div className="space-y-2">
            <h4 className="font-semibold">Ablauf des Spiels</h4>
            <ul className="list-decimal pl-5 space-y-1 text-sm">
              <li><span className="font-medium">Team Zuweisung:</span> Jeder Spieler erhält geheim sein Team.</li>
              <li><span className="font-medium">Operationen:</span> Jeder Spieler bekommt eine <em>Operation</em>, die entweder Informationen enthüllt oder das Ziel des Spielers verändert.</li>
              <li><span className="font-medium">Abstimmung:</span> Es wird ein Spieler ausgewählt, von dem vermutet wird, dass dieser der Hochstapler ist. Anhand des Teams (und ggf. individueller Ziele) wird automatisch ausgewertet, wer gewinnt oder verliert.</li>
            </ul>
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold">Operationen</h4>
            <p className="text-sm">Dies ist eine Liste aller Operationen mit Erklärungen:</p>
            <div className="mt-3 flex flex-col gap-2" ref={chipsRef}>
              {rows.map((row, idx) => (
                <React.Fragment key={`row-${idx}`}>
                  <div className="flex flex-wrap gap-2">
                    {row.map(key => {
                      const op = OPS.find(o => o.key === key)!;
                      return (
                        <button
                          key={key}
                          ref={(el) => { chipBtnRefs.current[key] = el; }}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setActiveOp(prev => (prev === key ? null : key)); }}
                          data-testid={`op-chip-${key}`}
                          aria-expanded={activeOp === key}
                          aria-label={op.desc}
                          className="inline-flex items-center rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1 text-xs font-medium hover:bg-indigo-100"
                        >
                          {op.key}
                        </button>
                      );
                    })}
                  </div>
                  <div
                    className={
                      "overflow-hidden transition-all duration-300 ease-out origin-top transform " +
                      (row.includes(activeOp || '')
                        ? "mt-2 opacity-100 max-h-96 scale-y-100"
                        : "mt-0 opacity-0 max-h-0 scale-y-0")
                    }
                    aria-hidden={!row.includes(activeOp || '')}
                  >
                    <div className="rounded-xl bg-white text-gray-800 text-sm p-3 shadow-xl border border-indigo-200">
                      <div className="h-1 w-full bg-gradient-to-r from-indigo-600 to-purple-600 rounded-md mb-2" />
                      {OPS.find(o => o.key === activeOp)?.desc}
                    </div>
                  </div>
                </React.Fragment>
              ))}
            </div>

            {/* Invisible measurer to capture chip widths without affecting layout */}
            <div ref={measureRef} className="absolute opacity-0 pointer-events-none -z-10">
              {OPS.map(op => (
                <button
                  key={`measure-${op.key}`}
                  ref={(el) => { chipBtnRefs.current[op.key] = chipBtnRefs.current[op.key] || el; }}
                  className="inline-flex items-center rounded-full bg-indigo-50 border px-3 py-1 text-xs"
                >
                  {op.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">Verstanden</button>
        </div>
      </div>
    </div>
  ) : null;
};

export default GameRulesModal;
