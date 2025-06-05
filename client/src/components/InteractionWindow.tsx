import React from 'react';
import { GamePhase, Player } from '@/types';

interface PlayerOperation {
  name: string;
  details: {
    message?: string;
    success?: boolean;
    availablePlayers?: string[];
    myTeam?: string;
    confessionMade?: boolean;
    targetPlayer?: string;
    teamChanged?: boolean;
    grudgeTarget?: string;
    revealedImpostor?: string;
    revealedAgent?: string;
    revealedPlayers?: string[];
    [key: string]: unknown;
  };
  used?: boolean;
}

interface GameResult { // This should match the structure within GameState['results']
  username: string;
  team: string;
  operation?: string; // Operation might be optional or part of a nested object
  win_status: 'won' | 'lost' | string; // Or more specific statuses
  // Add any other fields that come with game results per player
}

interface InteractionWindowProps {
  myOperation: PlayerOperation | null;
  operationTargetPlayer: string | null;
  setOperationTargetPlayer: (target: string | null) => void;
  onUseConfession: () => void;
  onUseDefector: () => void;
  username: string; // Current player's username
  currentPhase: GamePhase;
  players: Player[]; // Full list of players for target selection
  gameResults?: GameResult[]; // For displaying game results
}

const InteractionWindow: React.FC<InteractionWindowProps> = ({
  myOperation,
  operationTargetPlayer,
  setOperationTargetPlayer,
  onUseConfession,
  onUseDefector,
  username,
  currentPhase,
  players,
  gameResults,
}) => {

  const handleTargetSelection = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setOperationTargetPlayer(e.target.value === "" ? null : e.target.value);
  };

  const renderOperationContent = () => {
    if (!myOperation) {
      return <p className="text-gray-500 italic">No active operation assigned or available at this phase.</p>;
    }

    const { name, details, used } = myOperation;
    // Ensure availablePlayersForOperation is an array of strings (usernames)
    const availablePlayersForOperation = (details.availablePlayers || players.map(p => p.username)).filter(pName => pName !== username);


    return (
      <div className="space-y-4">
        <div>
          <h4 className="text-xl font-semibold text-indigo-700 mb-1">{name.toUpperCase()}</h4>
          {details.message && <p className="text-sm text-gray-600 bg-indigo-50 p-3 rounded-md shadow-sm">{details.message}</p>}
        </div>

        {name === 'confession' && (
          <div>
            {!(details.confessionMade || used) ? (
              <form onSubmit={(e) => { e.preventDefault(); onUseConfession(); }} className="space-y-3 p-3 bg-gray-50 rounded-md border">
                <label htmlFor="confessionTarget" className="block text-sm font-medium text-gray-700">Confess your team to:</label>
                <select
                  id="confessionTarget"
                  value={operationTargetPlayer || ""}
                  onChange={handleTargetSelection}
                  required
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm"
                >
                  <option value="">-- Select a player --</option>
                  {availablePlayersForOperation.map(pName => <option key={pName} value={pName}>{pName}</option>)}
                </select>
                <button type="submit" disabled={!operationTargetPlayer} className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400 transition-colors">
                  Use Confession
                </button>
              </form>
            ) : (
              <p className="text-green-600 font-medium flex items-center"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline mr-1" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>Confession made or operation used.</p>
            )}
          </div>
        )}

        {name === 'defector' && (
          <div>
            {!(details.targetPlayer || used) ? (
              <form onSubmit={(e) => { e.preventDefault(); onUseDefector(); }} className="space-y-3 p-3 bg-gray-50 rounded-md border">
                <label htmlFor="defectorTarget" className="block text-sm font-medium text-gray-700">Choose player to target for defection:</label>
                <select
                  id="defectorTarget"
                  value={operationTargetPlayer || ""}
                  onChange={handleTargetSelection}
                  required
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm"
                >
                  <option value="">-- Select a player --</option>
                  {availablePlayersForOperation.map(pName => <option key={pName} value={pName}>{pName}</option>)}
                </select>
                <button type="submit" disabled={!operationTargetPlayer} className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:bg-gray-400 transition-colors">
                  Use Defector
                </button>
              </form>
            ) : (
              <p className="text-blue-600 font-medium flex items-center"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline mr-1" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>Defector target {details.targetPlayer ? `is ${details.targetPlayer}` : 'chosen'}. {details.teamChanged ? 'Team change successful!' : (used ? 'Operation used.' : '')}</p>
            )}
          </div>
        )}

        {/* Informational display for other operations or used operations */}
        {name !== 'confession' && name !== 'defector' && (details.grudgeTarget || details.revealedAgent || details.revealedImpostor || (details.revealedPlayers && details.revealedPlayers.length > 0)) && (
            <div className="text-sm p-3 bg-gray-100 rounded-md border">
                {details.grudgeTarget && <p><strong>Grudge Target:</strong> {details.grudgeTarget}</p>}
                {details.revealedAgent && details.revealedImpostor && (
                    <p><strong>Intel:</strong> An Agent is <span className="font-semibold text-blue-600">{details.revealedAgent}</span>, and an Impostor is <span className="font-semibold text-red-600">{details.revealedImpostor}</span>.</p>
                )}
                {details.revealedPlayers && details.revealedPlayers.length > 0 && (
                    <p><strong>Photographs show:</strong> {details.revealedPlayers.join(' and ')} are on the same team.</p>
                )}
            </div>
        )}

        {used && (name !== 'confession' || !details.confessionMade) && (name !== 'defector' || !details.targetPlayer) && <p className="text-gray-500 italic mt-3">This operation has been used or its primary action completed.</p>}
      </div>
    );
  };

  const renderGameResults = () => {
    if (!gameResults || gameResults.length === 0) {
      return <p className="text-gray-500 italic">No game results available at this time.</p>;
    }
    // Assuming gameResults is an array of GameResult objects
    const winningTeam = gameResults.find(r => r.win_status === 'won')?.team; // Simplistic way to find winning team

    return (
      <div className="space-y-4">
        <h4 className="text-xl font-semibold text-green-700">Game Over!</h4>
        {winningTeam && <p className="text-lg font-medium">The <span className="font-bold text-green-600">{winningTeam}</span> team has won!</p>}
        <ul className="space-y-2">
          {gameResults.map((result, index) => (
            <li key={result.username || index} className={`p-3 rounded-md shadow-sm border ${result.win_status === 'won' ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
              <span className="font-semibold text-gray-800">{result.username}</span>
              <span className="text-sm text-gray-600"> ({result.team || 'Unknown Team'}, Op: {result.operation || 'None'})</span>
              <span className={`block text-right font-bold text-sm ${result.win_status === 'won' ? 'text-green-600' : 'text-red-600'}`}>{result.win_status.toUpperCase()}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  let content;
  if (currentPhase === GamePhase.COMPLETED) {
    content = renderGameResults();
  } else if (currentPhase === GamePhase.OPERATION_ASSIGNMENT || currentPhase === GamePhase.OPERATION_PREPARATION || (currentPhase === GamePhase.TEAM_ASSIGNMENT && myOperation) ) {
    // Show operation content if it's operation assignment/preparation phase,
    // or if it's team assignment phase AND an operation (like Mole's initial info) is already available.
    content = renderOperationContent();
  } else {
    content = <p className="text-gray-500 italic">Waiting for the next game event or your interaction...</p>;
  }

  return (
    <div className="interaction-window p-4 border rounded-lg shadow-lg bg-white min-h-[200px] h-full flex flex-col">
      <h3 className="text-lg font-bold mb-3 text-gray-800 border-b pb-2">Interaction Panel</h3>
      <div className="flex-grow overflow-y-auto">
        {content}
      </div>
    </div>
  );
};

export default InteractionWindow;
