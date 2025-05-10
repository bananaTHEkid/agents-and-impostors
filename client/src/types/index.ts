export enum GamePhase {
  WAITING = 'waiting',
  TEAM_ASSIGNMENT = 'team_assignment',
  OPERATION_ASSIGNMENT = 'operation_assignment',
  VOTING = 'voting',
  COMPLETED = 'completed'
}

export interface LandingPageProps {
  onJoinGame: (code: string) => void;
}

export interface GameLobbyProps {
  lobbyCode: string;
  onStartGame: () => void; // Callback to transition to game view when game starts
  onExitLobby: () => void; // Callback to return to landing page when exiting lobby
}

export interface GameRoomProps {
  lobbyCode: string;
  onExitGame: () => void;
}

export interface Player {
  username: string;
  team?: string;
  operation?: string;
  eliminated?: boolean;
  win_status?: string;
  isHost?: boolean;
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