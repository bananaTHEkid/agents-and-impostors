import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import OperationPanel from '../../components/operations/OperationPanel';
import { mockSocket } from '../utils/setup';

describe('OperationPanel', () => {
  const baseProps = {
    lobbyCode: 'TESTLOBBY',
    username: 'testUser',
    socket: mockSocket,
  } as any;

  it('disables acceptance when it is NOT the player\'s turn', async () => {
    const operation = { name: 'anonymous tip', info: { message: 'Tip' }, used: false } as any;

    render(<OperationPanel {...baseProps} operation={operation} isMyTurn={false} />);

    const acceptBtn = await screen.findByTestId('accept-assignment-btn');
    expect(acceptBtn).toBeDisabled();
  });

  it('enables acceptance when it IS the player\'s turn', async () => {
    const operation = { name: 'anonymous tip', info: { message: 'Tip' }, used: false } as any;

    render(<OperationPanel {...baseProps} operation={operation} isMyTurn={true} />);

    const acceptBtn = await screen.findByTestId('accept-assignment-btn');
    expect(acceptBtn).toBeEnabled();

    const user = userEvent.setup();
    await user.click(acceptBtn);
    expect(mockSocket.emit).toHaveBeenCalledWith('accept-assignment', expect.objectContaining({ lobbyCode: 'TESTLOBBY', username: 'testUser' }));
  });
});
