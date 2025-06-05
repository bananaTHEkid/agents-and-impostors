import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LobbyWindow from '../components/LobbyWindow';
import { GamePhase } from '../types'; // Assuming types are correctly pathed for tests
import React from 'react';

describe('LobbyWindow', () => {
  it('renders without crashing and shows correct title', () => {
    render(<LobbyWindow players={[]} currentPhase={GamePhase.WAITING} username="TestUser" />);
    expect(screen.getByText('Players in Lobby')).toBeInTheDocument();
  });
});
