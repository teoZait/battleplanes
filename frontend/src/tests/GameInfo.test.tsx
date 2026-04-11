import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import GameInfo from '../components/GameInfo';
import type { GameState } from '../reducers/gameReducer';
import { type ConnectionStatus, PLAYER1, PLAYER2 } from '../hooks/UseGameWebSocket';

afterEach(() => cleanup());

const defaultProps = {
  gameState: 'playing' as GameState,
  playerId: PLAYER1,
  currentTurn: PLAYER1,
  message: '',
  winner: null as string | null,
  gameId: 'test-game-id',
  connectionStatus: 'connected' as ConnectionStatus,
};

describe('GameInfo - Connection Status Display', () => {

  it('should not show connection banner when connected or disconnected', () => {
    for (const status of ['connected', 'disconnected'] as ConnectionStatus[]) {
      const { unmount } = render(<GameInfo {...defaultProps} connectionStatus={status} />);
      expect(screen.queryByText('Connecting...')).toBeNull();
      expect(screen.queryByText('Connection lost. Reconnecting...')).toBeNull();
      unmount();
    }
  });

  it('should show connecting banner with correct text and CSS class', () => {
    const { container } = render(<GameInfo {...defaultProps} connectionStatus="connecting" />);

    const el = container.querySelector('.connection-status');
    expect(el).not.toBeNull();
    expect(el!.className).toContain('connecting');
    expect(el!.textContent).toBe('Connecting...');
  });

  it('should show reconnecting banner with correct text and CSS class', () => {
    const { container } = render(<GameInfo {...defaultProps} connectionStatus="reconnecting" />);

    const el = container.querySelector('.connection-status');
    expect(el).not.toBeNull();
    expect(el!.className).toContain('reconnecting');
    expect(el!.textContent).toBe('Connection lost. Reconnecting...');
  });
});

describe('GameInfo - Existing Functionality Preserved', () => {

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
      <GameInfo {...defaultProps} playerId={PLAYER1} currentTurn={PLAYER1} gameState="playing" />
    );

    expect(screen.getByText(/Your Turn/)).toBeTruthy();
  });

  it('should show "Opponent\'s Turn" when it is not the player\'s turn', () => {
    render(
      <GameInfo {...defaultProps} playerId={PLAYER1} currentTurn={PLAYER2} gameState="playing" />
    );

    expect(screen.getByText(/Opponent's Turn/)).toBeTruthy();
  });

  it('should show winner message when player wins', () => {
    render(
      <GameInfo {...defaultProps} gameState="finished" winner={PLAYER1} playerId={PLAYER1} />
    );

    expect(screen.getByText(/You Won/)).toBeTruthy();
  });

  it('should show loser message when player loses', () => {
    render(
      <GameInfo {...defaultProps} gameState="finished" winner={PLAYER2} playerId={PLAYER1} />
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

describe('GameInfo - Copy Game Link', () => {

  it('should show "Copy Link" button when gameId exists', () => {
    render(<GameInfo {...defaultProps} gameId="test-game-id" />);

    const btn = screen.getByTitle('Copy game link');
    expect(btn).toBeTruthy();
    expect(btn.textContent).toContain('Copy Link');
  });

  it('should not show raw game ID text', () => {
    render(<GameInfo {...defaultProps} gameId="test-game-id" />);

    expect(screen.queryByText('test-game-id')).toBeNull();
  });

  it('should copy full game URL to clipboard and show confirmation', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<GameInfo {...defaultProps} gameId="abc-123" />);

    const btn = screen.getByTitle('Copy game link');
    expect(btn.textContent).toContain('Copy Link');

    act(() => btn.click());

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/game/abc-123`);
    expect(btn.textContent).toContain('Copied!');
  });

  it('should not call clipboard when gameId is null', () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });

    render(<GameInfo {...defaultProps} gameId={null} />);

    // No copy button rendered when no gameId
    expect(screen.queryByTitle('Copy game link')).toBeNull();
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe('GameInfo - Session Expired Banner', () => {

  it('should not show session expired banner by default', () => {
    const { container } = render(<GameInfo {...defaultProps} />);

    expect(container.querySelector('.session-expired-banner')).toBeNull();
  });

  it('should show session expired banner when sessionExpired is true', () => {
    const { container } = render(<GameInfo {...defaultProps} sessionExpired={true} />);

    expect(container.querySelector('.session-expired-banner')).not.toBeNull();
    expect(container.textContent).toContain('session has expired');
  });

  it('should show new game button when onNewGame is provided', () => {
    const { container } = render(
      <GameInfo {...defaultProps} sessionExpired={true} onNewGame={() => {}} />
    );

    const btn = container.querySelector('.session-expired-banner .btn');
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toContain('New Game');
  });

  it('should not show new game button when onNewGame is not provided', () => {
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

  it('should call onNewGame when new game button is clicked', () => {
    const onNewGame = vi.fn();
    const { container } = render(
      <GameInfo {...defaultProps} sessionExpired={true} onNewGame={onNewGame} />
    );

    const btn = container.querySelector('.session-expired-banner .btn') as HTMLButtonElement;
    btn.click();
    expect(onNewGame).toHaveBeenCalledOnce();
  });
});
