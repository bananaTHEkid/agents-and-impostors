// client/src/__tests__/NotificationWindow.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import NotificationWindow from '../components/NotificationWindow';
import { GamePhase } from '../types'; // Assuming types are correctly pathed for tests
import React from 'react';

describe('NotificationWindow', () => {
  it('renders "No new notifications" when no notifications are provided', () => {
    render(<NotificationWindow notifications={[]} currentPhase={GamePhase.WAITING} />);
    expect(screen.getByText('Notifications')).toBeInTheDocument(); // Check title
    expect(screen.getByText('No new notifications.')).toBeInTheDocument();
  });

  it('renders a list of notifications and checks quantity', () => {
    const mockNotifications = [
      'Player1 has joined the game.',
      'The game is about to start.',
      'Round 1 begins!',
    ];
    render(<NotificationWindow notifications={mockNotifications} currentPhase={GamePhase.GAMEPLAY} />);

    // Verify each notification text is present
    mockNotifications.forEach(notificationText => {
      expect(screen.getByText(notificationText)).toBeInTheDocument();
    });

    // Check if all notification items are rendered by looking for their container divs
    // This assumes each notification is wrapped in a div with specific classes by the component.
    // The component uses "p-2.5 mb-2 bg-blue-50 border border-blue-200 rounded-md shadow-sm text-sm text-blue-800 break-words"
    const notificationElements = screen.getAllByText(/.+/).filter(
      el => el.classList.contains('p-2.5') && el.classList.contains('bg-blue-50')
    );
    expect(notificationElements.length).toBe(mockNotifications.length);
  });

  it('displays the current game phase correctly formatted (OPERATION_ASSIGNMENT)', () => {
    render(<NotificationWindow notifications={[]} currentPhase={GamePhase.OPERATION_ASSIGNMENT} />);
    // The component formats the phase like: "OPERATION ASSIGNMENT"
    expect(screen.getByText('Current Phase:', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('OPERATION ASSIGNMENT', { exact: false })).toBeInTheDocument();
  });

  it('displays another game phase correctly formatted (VOTING)', () => {
    render(<NotificationWindow notifications={[]} currentPhase={GamePhase.VOTING} />);
    expect(screen.getByText('Current Phase:', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('VOTING', { exact: false })).toBeInTheDocument();

  });

  it('displays a phase with multiple underscores correctly formatted (OPERATION_PREPARATION)', () => {
    render(<NotificationWindow notifications={[]} currentPhase={GamePhase.OPERATION_PREPARATION} />);
    expect(screen.getByText('Current Phase:', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('OPERATION PREPARATION', { exact: false })).toBeInTheDocument();
  });


  it('handles an empty notification string gracefully', () => {
    const mockNotifications = ['This is a message.', '', 'Another message.'];
    render(<NotificationWindow notifications={mockNotifications} currentPhase={GamePhase.GAMEPLAY} />);

    // "No new notifications." should not be present
    expect(screen.queryByText('No new notifications.')).not.toBeInTheDocument();

    // Check that all three notification containers are rendered
    const notificationElements = screen.getAllByText(/.*/).filter(
      el => el.classList.contains('p-2.5') && el.classList.contains('bg-blue-50')
    );
    // This will count divs that contain text and the one that would render for the empty string.
    // The one with empty string will have textContent '', but the div itself exists.
    expect(notificationElements.length).toBe(mockNotifications.length);

    // Specifically find the element that corresponds to the empty string
    const emptyNotificationDiv = notificationElements.find(el => el.textContent === '');
    expect(emptyNotificationDiv).toBeInTheDocument();
  });
});
