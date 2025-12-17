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

  it('disables inputs when it is NOT the player\'s turn', async () => {
    const operation = { name: 'anonymous tip', info: { message: 'Say something' }, used: false } as any;

    render(<OperationPanel {...baseProps} operation={operation} isMyTurn={false} />);

    // TextInputRenderer uses a textarea; it should be disabled
    const textarea = await screen.findByPlaceholderText('Enter your message...');
    expect(textarea).toBeDisabled();

    const sendButton = screen.getByRole('button', { name: /send/i });
    expect(sendButton).toBeDisabled();
  });

  it('enables inputs when it IS the player\'s turn', async () => {
    const operation = { name: 'anonymous tip', info: { message: 'Say something' }, used: false } as any;

    render(<OperationPanel {...baseProps} operation={operation} isMyTurn={true} />);

    const textarea = await screen.findByPlaceholderText('Enter your message...');
    expect(textarea).toBeEnabled();

    const sendButton = screen.getByRole('button', { name: /send/i });
    expect(sendButton).toBeDisabled(); // initially disabled until text entered

    const user = userEvent.setup();
    await user.type(textarea, 'hello');
    expect(sendButton).toBeEnabled();

    // Emulate click and ensure socket.emit called with eventName 'operation-used'
    await user.click(sendButton);
    expect(mockSocket.emit).toHaveBeenCalled();
  });
});
