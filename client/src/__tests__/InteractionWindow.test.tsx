// client/src/__tests__/InteractionWindow.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import InteractionWindow from '../components/InteractionWindow';
import { GamePhase, Player } from '../types'; // Assuming types are correctly pathed for tests
import React from 'react';

// Local type definitions for the test, mirroring those in InteractionWindow.tsx
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

interface GameResult {
  username: string;
  team: string;
  operation?: string;
  win_status: 'won' | 'lost' | string;
}

const baseMockPlayers: Player[] = [
  { username: 'Player1', id: 'p1', team: 'agent', isHost: false },
  { username: 'Player2', id: 'p2', team: 'impostor', isHost: false },
  { username: 'TestUser', id: 'tu', team: 'agent', isHost: false },
];

describe('InteractionWindow', () => {
  const mockSetOperationTargetPlayer = vi.fn();
  const mockOnUseConfession = vi.fn();
  const mockOnUseDefector = vi.fn();

  const defaultProps = {
    operationTargetPlayer: null,
    setOperationTargetPlayer: mockSetOperationTargetPlayer,
    onUseConfession: mockOnUseConfession,
    onUseDefector: mockOnUseDefector,
    username: "TestUser",
    players: baseMockPlayers,
    gameResults: [],
    myOperation: null,
  };

  beforeEach(() => {
    vi.clearAllMocks(); // Clear mocks before each test
  });

  it('renders default title and message when no operation and not completed phase', () => {
    render(<InteractionWindow {...defaultProps} currentPhase={GamePhase.WAITING} />);
    // Title in the actual component is "Interaction Panel"
    expect(screen.getByText('Interaction Panel')).toBeInTheDocument();
    expect(screen.getByText(/Waiting for the next game event or your interaction.../i)).toBeInTheDocument();
  });

  it('renders "No active operation" when no operation in relevant phase (OPERATION_ASSIGNMENT)', () => {
    render(<InteractionWindow {...defaultProps} currentPhase={GamePhase.OPERATION_ASSIGNMENT} />);
    expect(screen.getByText(/No active operation assigned or available at this phase./i)).toBeInTheDocument();
  });
   it('renders "No active operation" when no operation in relevant phase (OPERATION_PREPARATION)', () => {
    render(<InteractionWindow {...defaultProps} currentPhase={GamePhase.OPERATION_PREPARATION} />);
    expect(screen.getByText(/No active operation assigned or available at this phase./i)).toBeInTheDocument();
  });


  describe('Confession Operation', () => {
    const confessionOp: PlayerOperation = {
      name: 'confession',
      details: { message: 'Confess your team.', availablePlayers: ['Player1', 'Player2', 'TestUser'] }, // TestUser is self
      used: false,
    };

    it('renders confession form with available players (excluding self)', () => {
      render(<InteractionWindow {...defaultProps} myOperation={confessionOp} currentPhase={GamePhase.OPERATION_ASSIGNMENT} />);
      expect(screen.getByText('CONFESSION')).toBeInTheDocument();
      expect(screen.getByText('Confess your team to:')).toBeInTheDocument();
      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
      // Check that 'TestUser' (self) is not an option
      expect(screen.queryByRole('option', { name: 'TestUser' })).toBeNull();
      expect(screen.getByRole('option', { name: 'Player1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Use Confession' })).toBeInTheDocument();
    });

    it('allows selecting a player and calls setOperationTargetPlayer', () => {
      render(<InteractionWindow {...defaultProps} myOperation={confessionOp} currentPhase={GamePhase.OPERATION_ASSIGNMENT} />);
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'Player1' } });
      expect(mockSetOperationTargetPlayer).toHaveBeenCalledWith('Player1');
    });

    it('calls onUseConfession when submitting with a selected player', () => {
      render(<InteractionWindow {...defaultProps} myOperation={confessionOp} operationTargetPlayer="Player1" currentPhase={GamePhase.OPERATION_ASSIGNMENT} />);
      const submitButton = screen.getByRole('button', { name: 'Use Confession' });
      expect(submitButton).not.toBeDisabled();
      fireEvent.click(submitButton);
      expect(mockOnUseConfession).toHaveBeenCalled();
    });

    it('submit button is disabled if no player selected', () => {
      render(<InteractionWindow {...defaultProps} myOperation={confessionOp} operationTargetPlayer={null} currentPhase={GamePhase.OPERATION_ASSIGNMENT} />);
      const submitButton = screen.getByRole('button', { name: 'Use Confession' });
      expect(submitButton).toBeDisabled();
    });

    it('shows confession made message if used (confessionMade flag)', () => {
      const usedConfessionOp = { ...confessionOp, details: { ...confessionOp.details, confessionMade: true }, used: true };
      render(<InteractionWindow {...defaultProps} myOperation={usedConfessionOp} currentPhase={GamePhase.OPERATION_ASSIGNMENT} />);
      expect(screen.getByText(/Confession made or operation used./i)).toBeInTheDocument();
    });
  });

  describe('Defector Operation', () => {
    const defectorOp: PlayerOperation = {
      name: 'defector',
      details: { message: 'Choose a target.', availablePlayers: ['Player1', 'Player2', 'TestUser'] },
      used: false,
    };
    it('renders defector form', () => {
      render(<InteractionWindow {...defaultProps} myOperation={defectorOp} currentPhase={GamePhase.OPERATION_ASSIGNMENT} />);
      expect(screen.getByText('DEFECTOR')).toBeInTheDocument();
      expect(screen.getByText('Choose player to target for defection:')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Use Defector' })).toBeInTheDocument();
    });

    it('calls onUseDefector when submitting with a selected player', () => {
      render(<InteractionWindow {...defaultProps} myOperation={defectorOp} operationTargetPlayer="Player2" currentPhase={GamePhase.OPERATION_ASSIGNMENT} />);
      const submitButton = screen.getByRole('button', { name: 'Use Defector' });
      expect(submitButton).not.toBeDisabled();
      fireEvent.click(submitButton);
      expect(mockOnUseDefector).toHaveBeenCalled();
    });

    it('shows defector chosen message if targetPlayer set', () => {
      const usedDefectorOp = { ...defectorOp, details: { ...defectorOp.details, targetPlayer: 'Player1' }, used: true }; // 'used:true' also implies it was processed
      render(<InteractionWindow {...defaultProps} myOperation={usedDefectorOp} currentPhase={GamePhase.OPERATION_ASSIGNMENT} />);
      expect(screen.getByText(/Defector target is Player1/i)).toBeInTheDocument();
    });
  });

  it('renders Grudge operation details', () => {
    const grudgeOp: PlayerOperation = { name: 'grudge', details: { grudgeTarget: 'PlayerX', message: "You hold a grudge." }, used: false };
    render(<InteractionWindow {...defaultProps} myOperation={grudgeOp} currentPhase={GamePhase.OPERATION_ASSIGNMENT} />);
    expect(screen.getByText('GRUDGE')).toBeInTheDocument();
    expect(screen.getByText("You hold a grudge.")).toBeInTheDocument(); // Check message
    expect(screen.getByText('Grudge Target: PlayerX')).toBeInTheDocument();
  });

  it('renders Danish Intelligence operation details', () => {
    const diOp: PlayerOperation = { name: 'danish intelligence', details: { revealedAgent: 'AgentA', revealedImpostor: 'ImpostorX', message: "Intel gathered." }, used: false };
    render(<InteractionWindow {...defaultProps} myOperation={diOp} currentPhase={GamePhase.OPERATION_ASSIGNMENT} />);
    expect(screen.getByText('DANISH INTELLIGENCE')).toBeInTheDocument();
    expect(screen.getByText("Intel gathered.")).toBeInTheDocument();
    expect(screen.getByText(/An Agent is AgentA, and an Impostor is ImpostorX./i)).toBeInTheDocument();
  });

  it('renders Old Photographs operation details', () => {
    const opOp: PlayerOperation = { name: 'old photographs', details: { revealedPlayers: ['PlayerY', 'PlayerZ'], message: "Photos found." }, used: false };
    render(<InteractionWindow {...defaultProps} myOperation={opOp} currentPhase={GamePhase.OPERATION_ASSIGNMENT} />);
    expect(screen.getByText('OLD PHOTOGRAPHS')).toBeInTheDocument();
    expect(screen.getByText("Photos found.")).toBeInTheDocument();
    expect(screen.getByText(/Photographs show: PlayerY and PlayerZ are on the same team./i)).toBeInTheDocument();
  });


  it('renders game results when phase is COMPLETED', () => {
    const results: GameResult[] = [
      { username: 'Player1', team: 'Agent', operation: 'None', win_status: 'won' },
      { username: 'Player2', team: 'Impostor', operation: 'Sabotage', win_status: 'lost' },
    ];
    render(<InteractionWindow {...defaultProps} currentPhase={GamePhase.COMPLETED} gameResults={results} />);
    expect(screen.getByText('Game Over!')).toBeInTheDocument(); // Title changed in component
    expect(screen.getByText(/Player1/)).toBeInTheDocument();
    expect(screen.getByText(/Agent, Op: None/)).toBeInTheDocument();
    expect(screen.getByText(/WON/)).toBeInTheDocument();
    expect(screen.getByText(/Player2/)).toBeInTheDocument();
    expect(screen.getByText(/Impostor, Op: Sabotage/)).toBeInTheDocument();
    expect(screen.getByText(/LOST/)).toBeInTheDocument();
  });

  it('renders "no game results available" if results are empty in COMPLETED phase', () => {
    render(<InteractionWindow {...defaultProps} currentPhase={GamePhase.COMPLETED} gameResults={[]} />);
    expect(screen.getByText('No game results available at this time.')).toBeInTheDocument();
  });
});
