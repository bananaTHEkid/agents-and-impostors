import React, { useEffect, useMemo, useState } from "react";

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

  const [opQuery, setOpQuery] = useState<string>('');
  const filteredOps = useMemo(() => {
    const q = opQuery.trim().toLowerCase();
    if (!q) return OPS;
    return OPS.filter(op =>
      op.key.toLowerCase().includes(q) ||
      op.label.toLowerCase().includes(q) ||
      op.desc.toLowerCase().includes(q)
    );
  }, [opQuery]);

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
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="font-semibold">Operationen</h4>
                <p className="text-sm text-gray-700">Schnelle Übersicht aller Operationen.</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Suche</label>
                <input
                  type="search"
                  value={opQuery}
                  onChange={(e) => setOpQuery(e.target.value)}
                  placeholder="Name oder Stichwort"
                  className="w-48 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  data-testid="ops-search"
                />
              </div>
            </div>

            <div className="grid gap-3 max-h-72 overflow-y-auto pr-1" role="list">
              {filteredOps.map((op) => (
                <div
                  key={op.key}
                  role="listitem"
                  className="rounded-xl border border-gray-100 bg-gray-50/80 p-3 shadow-sm hover:border-indigo-200"
                  data-testid={`op-card-${op.key}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center h-7 min-w-[2.5rem] px-3 rounded-full bg-indigo-600 text-white text-xs font-semibold uppercase">
                        {op.label}
                      </span>
                      <span className="text-xs text-gray-600">{op.key}</span>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-gray-800 leading-relaxed">{op.desc}</p>
                </div>
              ))}
              {!filteredOps.length && (
                <div className="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-600 text-center">
                  Keine Operation gefunden.
                </div>
              )}
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
