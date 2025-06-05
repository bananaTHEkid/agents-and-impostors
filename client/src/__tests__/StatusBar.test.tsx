import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBar from '../components/StatusBar';
import { GamePhase } from '../types'; // Assuming types are correctly pathed for tests
import React from 'react';

describe('StatusBar', () => {
  it('renders without crashing and shows key information labels', () => {
    render(
      <StatusBar
        playerName="TestUser"
        playerRole="Agent"
        currentPhase={GamePhase.WAITING}
        remainingTime="05:00"
      />
    );
    expect(screen.getByText(/Player:/)).toBeInTheDocument();
    expect(screen.getByText(/Phase:/)).toBeInTheDocument();
    expect(screen.getByText(/Time:/)).toBeInTheDocument();
  });
});
