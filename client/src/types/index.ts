export enum GamePhase {
  WAITING = 'waiting',
  TEAM_ASSIGNMENT = 'team_assignment',
  OPERATION_ASSIGNMENT = 'operation_assignment',
  VOTING = 'voting',
  COMPLETED = 'completed'
}

export interface Player {
  username: string;
  team?: 'agent' | 'impostor';
  operation?: string;
  eliminated?: boolean;
  isHost?: boolean;
}

export interface RoundResult {
  winner: 'agents' | 'impostors';
  eliminatedPlayers: string[];
  votes: Record<string, string>;
  roundNumber: number;
}

export interface VoteSubmission {
  lobbyCode: string;
  username: string;
  vote: string;
}

export interface PlayerVotedEvent {
  username: string;
}

export interface PhaseChangeEvent {
  phase: GamePhase;
  message?: string;
}

export interface LandingPageProps {
  onJoinGame: (code: string) => void;
}

export interface GameLobbyProps {
  lobbyCode: string;
  onStartGame?: () => void; // Optional: No longer used, App handles game-started event
  onExitLobby: () => void; // Callback to return to landing page when exiting lobby
}

export interface GameRoomProps {
  lobbyCode: string;
  onExitGame: () => void;
}


export interface GameState {
  currentState?: string;
  phase?: GamePhase;
  round?: number;
  totalRounds?: number;
  submittedPlayers?: string[];
  votedPlayers?: string[];
  results?: Array<{
    username: string;
    team: string;
    operation: string;
    win_status: string;
  }>;
}

// New interfaces for socket data
export interface OperationAssignedData {
  operation: string;
}

export interface GameResultsData {
  results: GameState["results"];
}

// Updated the PlayerJoinedData interface to ensure compatibility with SocketEventData.
export interface PlayerJoinedData {
  username: string;
  id?: string; // Optional ID field for player identification
  [key: string]: unknown; // Index signature for additional properties
}

export interface JoinSuccessData {
  lobbyCode: string;
}

export interface ErrorData {
  message?: string;
}

export interface PlayerRemovedData {
  username: string;
}

export interface SocketEventData {
  team?: string;
  operation?: string;
  username?: string;
  results?: Array<{
    username: string;
    team: string;
    win_status: string;
    isHost?: boolean;
    id?: string;
  }>;
  message?: string;
  [key: string]: unknown; // Index signature for additional properties
}
export interface GameMessage {
  type: 'system' | 'prompt' | 'player';
  text: string;
  from?: string; // Optional, only for player messages
}

// Voting payloads – brand-new
export interface VotingPhaseStartedData {
  stories: { id: string; text: string }[];
}

export interface CastVoteData {
  roomId: string;
  storyId: string;
  playerId: string;
}

export interface VoteUpdateData {
  playerId: string;
}

export interface VotingPhaseEndedData {
  results: {
    storyId: string;
    votes: number;
    voters: string[];
  }[];
}

/* If you keep a single map for all socket events */
export interface ServerToClientEvents {
  votingPhaseStarted: (data: VotingPhaseStartedData) => void;
  voteUpdate: (data: VoteUpdateData) => void;
  votingPhaseEnded: (data: VotingPhaseEndedData) => void;
  // …existing events
}

export interface ClientToServerEvents {
  castVote: (data: CastVoteData) => void;
  // …existing events
}
