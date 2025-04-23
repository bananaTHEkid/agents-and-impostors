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
  isHost?: boolean;
}

export interface GameState {
  currentState: 'waiting' | 'playing' | 'voting' | 'completed';
  round: number;
  totalRounds: number;
  currentPlayer?: string;
  submittedPlayers?: string[];
  votedPlayers?: string[];
} 