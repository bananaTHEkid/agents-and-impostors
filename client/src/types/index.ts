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
  onStartGame: () => void;
  onExitLobby: () => void;
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

export interface PlayerJoinedData {
  username: string;
}

export interface JoinSuccessData {
  lobbyCode: string;
}

export interface ErrorData {
  message?: string;
}