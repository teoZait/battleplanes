import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import GameBoard from '../components/GameBoard';
import type { CellStatus } from '../hooks/UseGameWebSocket';

afterEach(() => cleanup());

const createBoard = (fill: CellStatus = 'empty'): CellStatus[][] =>
  Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => fill));

const defaultProps = {
  board: createBoard(),
  onCellClick: vi.fn(),
  isOwnBoard: false,
};

describe('GameBoard - Turn Indicator UX', () => {

  it('should add "active-turn" class when isMyTurn is true on enemy board', () => {
    const { container } = render(
      <GameBoard {...defaultProps} isOwnBoard={false} isMyTurn={true} />
    );

    const board = container.querySelector('.game-board');
    expect(board!.className).toContain('active-turn');
    expect(board!.className).not.toContain('dimmed');
  });

  it('should add "dimmed" class when isMyTurn is false on enemy board', () => {
    const { container } = render(
      <GameBoard {...defaultProps} isOwnBoard={false} isMyTurn={false} />
    );

    const board = container.querySelector('.game-board');
    expect(board!.className).toContain('dimmed');
    expect(board!.className).not.toContain('active-turn');
  });

  it('should not add turn classes when isMyTurn is undefined', () => {
    const { container } = render(
      <GameBoard {...defaultProps} isOwnBoard={false} />
    );

    const board = container.querySelector('.game-board');
    expect(board!.className).not.toContain('active-turn');
    expect(board!.className).not.toContain('dimmed');
  });

  it('should not add turn classes on own board even if isMyTurn is set', () => {
    const { container } = render(
      <GameBoard {...defaultProps} isOwnBoard={true} isMyTurn={true} />
    );

    const board = container.querySelector('.game-board');
    expect(board!.className).not.toContain('active-turn');
    expect(board!.className).not.toContain('dimmed');
  });

  it('should add "disabled" class to cells when dimmed', () => {
    const { container } = render(
      <GameBoard {...defaultProps} isOwnBoard={false} isMyTurn={false} />
    );

    const cells = container.querySelectorAll('.cell.enemy');
    expect(cells.length).toBeGreaterThan(0);
    cells.forEach(cell => {
      expect(cell.className).toContain('disabled');
    });
  });

  it('should not add "disabled" class to cells when active', () => {
    const { container } = render(
      <GameBoard {...defaultProps} isOwnBoard={false} isMyTurn={true} />
    );

    const cells = container.querySelectorAll('.cell.enemy');
    cells.forEach(cell => {
      expect(cell.className).not.toContain('disabled');
    });
  });
});

describe('GameBoard - Cell Rendering', () => {

  it('should render 10x10 grid of cells', () => {
    const { container } = render(<GameBoard {...defaultProps} />);

    // 10 data rows, each with 10 cells (+ 1 row label = 11 children per row)
    const dataRows = container.querySelectorAll('.board-row:not(.label-row)');
    expect(dataRows).toHaveLength(10);

    dataRows.forEach(row => {
      const cells = row.querySelectorAll('.cell');
      expect(cells).toHaveLength(10);
    });
  });

  it('should render column labels 1-10', () => {
    const { container } = render(<GameBoard {...defaultProps} />);

    const colLabels = container.querySelectorAll('.column-label');
    expect(colLabels).toHaveLength(10);
    expect(colLabels[0].textContent).toBe('1');
    expect(colLabels[9].textContent).toBe('10');
  });

  it('should render row labels A-J', () => {
    const { container } = render(<GameBoard {...defaultProps} />);

    const rowLabels = container.querySelectorAll('.row-label');
    expect(rowLabels).toHaveLength(10);
    expect(rowLabels[0].textContent).toBe('A');
    expect(rowLabels[9].textContent).toBe('J');
  });

  it('should call onCellClick with coordinates when cell is clicked', () => {
    const onClick = vi.fn();
    const { container } = render(
      <GameBoard {...defaultProps} onCellClick={onClick} />
    );

    const dataRows = container.querySelectorAll('.board-row:not(.label-row)');
    const cells = dataRows[2].querySelectorAll('.cell'); // row index 2
    fireEvent.click(cells[3]); // column index 3

    expect(onClick).toHaveBeenCalledWith(3, 2);
  });

  it('should show plane segment on own board for "plane" cells', () => {
    const board = createBoard();
    board[1][2] = 'plane';

    const { container } = render(
      <GameBoard board={board} onCellClick={vi.fn()} isOwnBoard={true} />
    );

    const planeSegments = container.querySelectorAll('.plane-segment:not(.head)');
    expect(planeSegments.length).toBeGreaterThan(0);
  });

  it('should show cockpit on own board for "head" cells', () => {
    const board = createBoard();
    board[1][2] = 'head';

    const { container } = render(
      <GameBoard board={board} onCellClick={vi.fn()} isOwnBoard={true} />
    );

    const cockpits = container.querySelectorAll('.cockpit');
    expect(cockpits).toHaveLength(1);
  });

  it('should show hit marker for "hit" cells', () => {
    const board = createBoard();
    board[3][4] = 'hit';

    const { container } = render(
      <GameBoard board={board} onCellClick={vi.fn()} isOwnBoard={false} />
    );

    const hitMarkers = container.querySelectorAll('.hit-marker');
    expect(hitMarkers).toHaveLength(1);
  });

  it('should show big explosion for "head_hit" cells', () => {
    const board = createBoard();
    board[3][4] = 'head_hit';

    const { container } = render(
      <GameBoard board={board} onCellClick={vi.fn()} isOwnBoard={false} />
    );

    const bigExplosions = container.querySelectorAll('.explosion.big');
    expect(bigExplosions).toHaveLength(1);
  });

  it('should show miss marker for "miss" cells', () => {
    const board = createBoard();
    board[5][6] = 'miss';

    const { container } = render(
      <GameBoard board={board} onCellClick={vi.fn()} isOwnBoard={false} />
    );

    const missMarkers = container.querySelectorAll('.miss-marker');
    expect(missMarkers).toHaveLength(1);
  });

  it('should add "enemy" class to enemy board', () => {
    const { container } = render(
      <GameBoard {...defaultProps} isOwnBoard={false} />
    );

    const board = container.querySelector('.game-board');
    expect(board!.className).toContain('enemy');
  });

  it('should not add "enemy" class to own board', () => {
    const { container } = render(
      <GameBoard {...defaultProps} isOwnBoard={true} />
    );

    const board = container.querySelector('.game-board');
    expect(board!.className).not.toContain('enemy');
  });
});

describe('GameBoard - End of Game Reveal', () => {

  it('should show plane segments on enemy board when gameFinished is true', () => {
    const board = createBoard();
    board[1][2] = 'plane';

    const { container } = render(
      <GameBoard board={board} onCellClick={vi.fn()} isOwnBoard={false} gameFinished={true} />
    );

    const planeSegments = container.querySelectorAll('.plane-segment:not(.head)');
    expect(planeSegments.length).toBeGreaterThan(0);
  });

  it('should show cockpit on enemy board when gameFinished is true', () => {
    const board = createBoard();
    board[1][2] = 'head';

    const { container } = render(
      <GameBoard board={board} onCellClick={vi.fn()} isOwnBoard={false} gameFinished={true} />
    );

    const cockpits = container.querySelectorAll('.cockpit');
    expect(cockpits).toHaveLength(1);
  });

  it('should NOT show plane segments on enemy board during gameplay', () => {
    const board = createBoard();
    board[1][2] = 'plane';

    const { container } = render(
      <GameBoard board={board} onCellClick={vi.fn()} isOwnBoard={false} />
    );

    const planeSegments = container.querySelectorAll('.plane-segment');
    expect(planeSegments).toHaveLength(0);
  });

  it('should show plane segment under hit marker on enemy board when gameFinished', () => {
    const board = createBoard();
    board[1][2] = 'hit';

    const { container } = render(
      <GameBoard board={board} onCellClick={vi.fn()} isOwnBoard={false} gameFinished={true} />
    );

    const dataRows = container.querySelectorAll('.board-row:not(.label-row)');
    const cell = dataRows[1].querySelectorAll('.cell')[2];
    expect(cell.querySelector('.plane-segment')).not.toBeNull();
    expect(cell.querySelector('.hit-marker')).not.toBeNull();
  });

  it('should show plane segment under head_hit on enemy board when gameFinished', () => {
    const board = createBoard();
    board[1][2] = 'head_hit';

    const { container } = render(
      <GameBoard board={board} onCellClick={vi.fn()} isOwnBoard={false} gameFinished={true} />
    );

    const dataRows = container.querySelectorAll('.board-row:not(.label-row)');
    const cell = dataRows[1].querySelectorAll('.cell')[2];
    expect(cell.querySelector('.plane-segment.head')).not.toBeNull();
    expect(cell.querySelector('.hit-marker')).not.toBeNull();
  });
});
