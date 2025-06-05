import React from 'react';
import { GamePhase } from '@/types';
import { FiUser, FiShield, FiPlayCircle, FiClock } from 'react-icons/fi'; // Example icons

interface StatusBarProps {
  playerName: string;
  playerRole: string;
  currentPhase: GamePhase;
  remainingTime: string;
}

const StatusBar: React.FC<StatusBarProps> = ({ playerName, playerRole, currentPhase, remainingTime }) => {
  const formatPhase = (phase: GamePhase) => {
    if (!phase) return 'UNKNOWN PHASE';
    return phase.replace(/_/g, ' ').toUpperCase();
  };

  // Determine which icon to use for role, or if to combine with player
  // For this implementation, let's give PlayerRole its own icon if it's meaningful
  const showRole = playerRole && playerRole !== "Unknown" && playerRole !== "Unknown Role";

  return (
    <div className="status-bar bg-gradient-to-r from-slate-700 to-slate-800 text-white p-3 flex flex-wrap justify-between items-center rounded-lg shadow-md text-sm sm:text-base">
      <div className="flex items-center mr-3 mb-2 sm:mb-0">
        <FiUser className="mr-2 text-lg text-sky-300 flex-shrink-0" />
        <span>
          <span className="font-semibold">Player:</span> {playerName}
        </span>
      </div>

      {showRole && (
        <div className="flex items-center mr-3 mb-2 sm:mb-0">
          <FiShield className="mr-2 text-lg text-teal-300 flex-shrink-0" />
          <span>
            <span className="font-semibold">Role:</span> <span className="italic text-sky-200">{playerRole}</span>
          </span>
        </div>
      )}

      <div className="flex items-center mr-3 mb-2 sm:mb-0">
        <FiPlayCircle className="mr-2 text-lg text-emerald-300 flex-shrink-0" />
        <span>
          <span className="font-semibold">Phase:</span> {formatPhase(currentPhase)}
        </span>
      </div>
      <div className="flex items-center"> {/* Last item, no mr needed usually if it's the end */}
        <FiClock className="mr-2 text-lg text-amber-300 flex-shrink-0" />
        <span>
          <span className="font-semibold">Time:</span> {remainingTime}
        </span>
      </div>
    </div>
  );
};

export default StatusBar;
