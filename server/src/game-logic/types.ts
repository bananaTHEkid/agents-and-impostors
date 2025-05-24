export enum GamePhase {
  WAITING = 'waiting',
  TEAM_ASSIGNMENT = 'team_assignment',
  OPERATION_ASSIGNMENT = 'operation_assignment',
  VOTING = 'voting',
}

export interface RoundResult {
    winner: 'agents' | 'impostors';
    eliminatedPlayers: string[];
    votes: Record<string, string>;
    roundNumber: number;
}

export interface FinalResults {
    overallWinner: 'agents' | 'impostors';
    roundResults: RoundResult[];
    mvp: string;
    totalRounds: number;
    teamScores: {
        agents: number;
        impostors: number;
    };
}

export interface VoteValidationResult {
    isValid: boolean;
    error?: string;
}

export interface Lobby {
    id: string; // Added id property
    lobbyCode: string;
    players: string[]; // This might be derived from the players table now
    status: 'waiting' | 'playing' | 'completed';
    phase: GamePhase;
    current_round?: number; // Added current_round, optional as it might not exist for new lobbies
    total_rounds?: number; // Added total_rounds, optional
}
