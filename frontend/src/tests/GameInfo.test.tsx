import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import GameInfo from '../components/GameInfo';
import type { GameState } from '../reducers/gameReducer';
import type { ConnectionStatus } from '../hooks/UseGameWebSocket';

afterEach(() => cleanup());

const defaultProps = {
  gameState: 'playing' as GameState,
  playerId: 'player1',
  currentTurn: 'player1',
  message: '',
  winner: null as string | null,
  gameId: 'test-game-id',
  connectionStatus: 'connected' as ConnectionStatus,
};

describe('GameInfo - Connection Status Display', () => {

  it('should not show connection banner when connected', () => {
    render(<GameInfo {...defaultProps} connectionStatus="connected" />);

    expect(screen.queryByText('Connecting...')).toBeNull();
    expect(screen.queryByText('Connection lost. Reconnecting...')).toBeNull();
  });

  it('should not show connection banner when disconnected', () => {
    render(<GameInfo {...defaultProps} connectionStatus="disconnected" />);

    expect(screen.queryByText('Connecting...')).toBeNull();
    expect(screen.queryByText('Connection lost. Reconnecting...')).toBeNull();
  });

  it('should show "Connecting..." when status is connecting', () => {
    render(<GameInfo {...defaultProps} connectionStatus="connecting" />);

    expect(screen.getByText('Connecting...')).toBeTruthy();
  });

  it('should show reconnecting message when status is reconnecting', () => {
    render(<GameInfo {...defaultProps} connectionStatus="reconnecting" />);

    expect(screen.getByText('Connection lost. Reconnecting...')).toBeTruthy();
  });

  it('should apply correct CSS class for connecting status', () => {
    const { container } = render(<GameInfo {...defaultProps} connectionStatus="connecting" />);

    const el = container.querySelector('.connection-status');
    expect(el).not.toBeNull();
    expect(el!.className).toContain('connecting');
    expect(el!.textContent).toBe('Connecting...');
  });

  it('should apply correct CSS class for reconnecting status', () => {
    const { container } = render(<GameInfo {...defaultProps} connectionStatus="reconnecting" />);

    const el = container.querySelector('.connection-status');
    expect(el).not.toBeNull();
    expect(el!.className).toContain('reconnecting');
    expect(el!.textContent).toBe('Connection lost. Reconnecting...');
  });
});

describe('GameInfo - Existing Functionality Preserved', () => {

  it('should display game ID', () => {
    render(<GameInfo {...defaultProps} />);

    expect(screen.getByText('test-game-id')).toBeTruthy();
  });

  it('should show waiting status', () => {
    render(<GameInfo {...defaultProps} gameState="waiting" />);

    expect(screen.getByText(/Waiting/)).toBeTruthy();
  });

  it('should show placing status', () => {
    render(<GameInfo {...defaultProps} gameState="placing" />);

    expect(screen.getByText(/Placing Planes/)).toBeTruthy();
  });

  it('should show battle status', () => {
    render(<GameInfo {...defaultProps} gameState="playing" />);

    expect(screen.getByText(/Battle/)).toBeTruthy();
  });

  it('should show game over status', () => {
    render(<GameInfo {...defaultProps} gameState="finished" />);

    expect(screen.getByText(/Game Over/)).toBeTruthy();
  });

  it('should show "Your Turn" when it is the player\'s turn', () => {
    render(
      <GameInfo {...defaultProps} playerId="player1" currentTurn="player1" gameState="playing" />
    );

    expect(screen.getByText(/Your Turn/)).toBeTruthy();
  });

  it('should show "Opponent\'s Turn" when it is not the player\'s turn', () => {
    render(
      <GameInfo {...defaultProps} playerId="player1" currentTurn="player2" gameState="playing" />
    );

    expect(screen.getByText(/Opponent's Turn/)).toBeTruthy();
  });

  it('should show winner message when player wins', () => {
    render(
      <GameInfo {...defaultProps} gameState="finished" winner="player1" playerId="player1" />
    );

    expect(screen.getByText(/You Won/)).toBeTruthy();
  });

  it('should show loser message when player loses', () => {
    render(
      <GameInfo {...defaultProps} gameState="finished" winner="player2" playerId="player1" />
    );

    expect(screen.getByText(/You Lost/)).toBeTruthy();
  });

  it('should display message when provided', () => {
    render(<GameInfo {...defaultProps} message="Test message" />);

    expect(screen.getByText('Test message')).toBeTruthy();
  });

  it('should not display message box when message is empty', () => {
    const { container } = render(<GameInfo {...defaultProps} message="" />);

    expect(container.querySelector('.message-box')).toBeNull();
  });
});

describe('GameInfo - Session Expired Banner', () => {

  it('should not show session expired banner by default', () => {
    const { container } = render(<GameInfo {...defaultProps} />);

    expect(container.querySelector('.session-expired-banner')).toBeNull();
  });

  it('should not show session expired banner when sessionExpired is false', () => {
    const { container } = render(<GameInfo {...defaultProps} sessionExpired={false} />);

    expect(container.querySelector('.session-expired-banner')).toBeNull();
  });

  it('should show session expired banner when sessionExpired is true', () => {
    const { container } = render(<GameInfo {...defaultProps} sessionExpired={true} />);

    expect(container.querySelector('.session-expired-banner')).not.toBeNull();
    expect(container.textContent).toContain('session has expired');
  });

  it('should show continue button when onContinueGame is provided', () => {
    const { container } = render(
      <GameInfo {...defaultProps} sessionExpired={true} onContinueGame={() => {}} />
    );

    const btn = container.querySelector('.session-expired-banner .btn');
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toContain('Continue in New Game');
  });

  it('should not show continue button when onContinueGame is not provided', () => {
    const { container } = render(
      <GameInfo {...defaultProps} sessionExpired={true} />
    );

    const btn = container.querySelector('.session-expired-banner .btn');
    expect(btn).toBeNull();
  });

  it('should hide message box when sessionExpired is true', () => {
    const { container } = render(
      <GameInfo {...defaultProps} sessionExpired={true} message="Some message" />
    );

    expect(container.querySelector('.message-box')).toBeNull();
  });

  it('should call onContinueGame when continue button is clicked', () => {
    const onContinue = vi.fn();
    const { container } = render(
      <GameInfo {...defaultProps} sessionExpired={true} onContinueGame={onContinue} />
    );

    const btn = container.querySelector('.session-expired-banner .btn') as HTMLButtonElement;
    btn.click();
    expect(onContinue).toHaveBeenCalledOnce();
  });
});
