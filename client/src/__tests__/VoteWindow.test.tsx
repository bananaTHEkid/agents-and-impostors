// client/src/__tests__/VoteWindow.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VoteWindow from '../components/VoteWindow';
import React from 'react';

// Minimal Player type needed for this component's props
interface VotePlayer {
  id: string;
  name: string;
  hasVoted?: boolean; // Not directly used in VoteWindow's logic but part of GameRoom's data structure
}

const mockPlayers: VotePlayer[] = [
  { id: 'p1', name: 'Player1' },
  { id: 'p2', name: 'Player2' },
  { id: 'currentUser', name: 'TestUser' }, // Current user
];

describe('VoteWindow', () => {
  const mockOnVote = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks(); // Reset mocks before each test
  });

  it('renders "Vote For Player" title', () => {
    render(<VoteWindow players={[]} onVote={mockOnVote} canVote={false} currentUsername="TestUser" />);
    expect(screen.getByText('Vote For Player')).toBeInTheDocument();
  });

  describe('When canVote is true', () => {
    it('renders player cards, enables voting for others, and disables self card', () => {
      render(<VoteWindow players={mockPlayers} onVote={mockOnVote} canVote={true} currentUsername="TestUser" />);

      const player1Button = screen.getByRole('button', { name: /Player1/i });
      expect(player1Button).toBeInTheDocument();
      expect(player1Button).toBeEnabled();

      const player2Button = screen.getByRole('button', { name: /Player2/i });
      expect(player2Button).toBeInTheDocument();
      expect(player2Button).toBeEnabled();

      const selfCardButton = screen.getByRole('button', { name: /TestUser/i });
      expect(selfCardButton).toBeInTheDocument();
      expect(selfCardButton).toBeDisabled(); // Self card should be disabled
      expect(screen.getByText('(You)')).toBeInTheDocument(); // "(You)" label for self
    });

    it('calls onVote with player ID when another player card is clicked', () => {
      render(<VoteWindow players={mockPlayers} onVote={mockOnVote} canVote={true} currentUsername="TestUser" />);
      const player1Button = screen.getByRole('button', { name: /Player1/i });
      fireEvent.click(player1Button);
      expect(mockOnVote).toHaveBeenCalledWith('p1');
    });

    it('does not call onVote when self card (disabled) is clicked', () => {
      render(<VoteWindow players={mockPlayers} onVote={mockOnVote} canVote={true} currentUsername="TestUser" />);
      const selfCardButton = screen.getByRole('button', { name: /TestUser/i });
      fireEvent.click(selfCardButton); // Attempt to click disabled button
      expect(mockOnVote).not.toHaveBeenCalled();
    });

    it('renders no player cards if players array is empty but canVote is true', () => {
      render(<VoteWindow players={[]} onVote={mockOnVote} canVote={true} currentUsername="TestUser" />);
      // Expect no buttons if there are no players to vote for.
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      // The component currently renders an empty grid, so no specific message is expected here,
      // which is acceptable. If a message like "No players to vote for" was desired, this test would change.
    });
  });

  describe('When canVote is false', () => {
    it('displays "You have already voted, or voting is not currently active." message', () => {
      render(<VoteWindow players={mockPlayers} onVote={mockOnVote} canVote={false} currentUsername="TestUser" />);
      expect(screen.getByText('You have already voted, or voting is not currently active.')).toBeInTheDocument();
    });

    it('does not render player cards as clickable buttons', () => {
      render(<VoteWindow players={mockPlayers} onVote={mockOnVote} canVote={false} currentUsername="TestUser" />);
      // The component's logic is to not render the grid of buttons if canVote is false.
      expect(screen.queryByRole('button', { name: /Player1/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /TestUser/i })).not.toBeInTheDocument();
    });
  });
});
