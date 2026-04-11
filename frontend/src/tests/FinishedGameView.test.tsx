import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import FinishedGameView from '../components/FinishedGameView';
import type { FinishedGameData } from '../components/FinishedGameView';
import { type CellStatus, PLAYER1, PLAYER2 } from '../hooks/UseGameWebSocket';

afterEach(() => cleanup());

const createBoard = (): CellStatus[][] =>
  Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => 'empty' as CellStatus)
  );

const makeData = (winner = PLAYER1 as string, mode = 'classic'): FinishedGameData => {
  const p1 = createBoard();
  p1[0][2] = 'head_hit';
  p1[1][0] = 'plane';
  const p2 = createBoard();
  p2[0][7] = 'head_hit';
  p2[1][5] = 'plane';
  return { winner, boards: { [PLAYER1]: p1, [PLAYER2]: p2 }, mode };
};

describe('FinishedGameView', () => {

  it('should display player 1 as winner', () => {
    render(<FinishedGameView data={makeData(PLAYER1)} onNewGame={() => {}} />);
    expect(screen.getByText('Player 1 wins!')).toBeTruthy();
  });

  it('should display player 2 as winner', () => {
    render(<FinishedGameView data={makeData(PLAYER2)} onNewGame={() => {}} />);
    expect(screen.getByText('Player 2 wins!')).toBeTruthy();
  });

  it('should show trophy emoji only on winner board header', () => {
    render(<FinishedGameView data={makeData(PLAYER1)} onNewGame={() => {}} />);
    expect(screen.getByText('🏆 Player 1')).toBeTruthy();
    // Non-winner should not have trophy
    expect(screen.getByText('Player 2')).toBeTruthy();
    expect(screen.queryByText('🏆 Player 2')).toBeNull();
  });

  it('should render both game boards', () => {
    const { container } = render(
      <FinishedGameView data={makeData()} onNewGame={() => {}} />
    );
    expect(container.querySelectorAll('.game-board').length).toBe(2);
  });

  it('should show Game Over badge', () => {
    render(<FinishedGameView data={makeData()} onNewGame={() => {}} />);
    expect(screen.getByText('Game Over')).toBeTruthy();
  });

  it('should call onNewGame when New Game is clicked', () => {
    const onNewGame = vi.fn();
    render(<FinishedGameView data={makeData()} onNewGame={onNewGame} />);
    screen.getByText('New Game').click();
    expect(onNewGame).toHaveBeenCalledOnce();
  });

  it('should not show Rematch button (no WebSocket in artifact view)', () => {
    render(<FinishedGameView data={makeData()} onNewGame={() => {}} />);
    expect(screen.queryByText('Rematch')).toBeNull();
  });
});
