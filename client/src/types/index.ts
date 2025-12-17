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
  isCurrentTurn?: boolean;
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
  // Turn-based fields
  currentTurnPlayer?: string; // username of the player whose turn it currently is
  turnIndex?: number;
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

// Operation-related types
export interface OperationInfo {
  [key: string]: any;
}

export interface Operation {
  name: string;
  info?: OperationInfo;
  used?: boolean;
}

/**
 * Properties supplied to a component that renders a game operation UI.
 *
 * Provides the operation data, context about the current player and lobby, and
 * optional helpers for real-time communication and submitting operation results.
 *
 * @property operation - The operation object to render, or null when no operation is active.
 * @property lobbyCode - The identifier for the lobby/session this operation belongs to.
 * @property username - The current player's username (used for attributing actions and displaying identity).
 * @property socket - Optional socket/connection instance for emitting or listening to real-time events.
 * @property onSubmit - Optional callback invoked when the user submits the operation. Receives a payload map of field values.
 * @property disabled - When true, the UI should prevent input and submission (read-only or inactive state).
 * @property isMyTurn - Whether it is the current client's turn; used to enable or gate interactive inputs.
 * @property myTeam - The client's team, either 'agent' or 'impostor', used to adjust displayed information and available actions.
 */
export interface OperationRendererProps {
  operation: Operation | null;
  lobbyCode: string;
  username: string;
  socket?: any;
  onSubmit?: (payload: Record<string, any>) => void;
  disabled?: boolean;
  // Whether it's this client's turn (used by OperationPanel to gate inputs)
  isMyTurn?: boolean;
  // The player's own team (to display in operation UI)
  myTeam?: 'agent' | 'impostor';
}
