import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import PlanePlacement from '../components/PlanePlacement';

afterEach(() => cleanup());

describe('PlanePlacement - UI Elements', () => {

  it('should render placement board with 10x10 grid', () => {
    const { container } = render(
      <PlanePlacement onPlanesPlaced={vi.fn()} />
    );

    const rows = container.querySelectorAll('.placement-board .board-row');
    expect(rows).toHaveLength(10);

    rows.forEach(row => {
      const cells = row.querySelectorAll('.cell');
      expect(cells).toHaveLength(10);
    });
  });

  it('should show "Place 2 more planes" initially', () => {
    const { container } = render(
      <PlanePlacement onPlanesPlaced={vi.fn()} />
    );

    expect(container.textContent).toContain('Place 2 more planes');
  });

  it('should render rotate button with current orientation', () => {
    const { container } = render(
      <PlanePlacement onPlanesPlaced={vi.fn()} />
    );

    const rotateBtn = container.querySelector('.btn-rotate');
    expect(rotateBtn).not.toBeNull();
    expect(rotateBtn!.textContent).toContain('UP');
  });

  it('should render plane list with 2 planes to place', () => {
    const { container } = render(
      <PlanePlacement onPlanesPlaced={vi.fn()} />
    );

    const planeItems = container.querySelectorAll('.plane-list li');
    expect(planeItems).toHaveLength(2);
  });

  it('should render reset button', () => {
    const { container } = render(
      <PlanePlacement onPlanesPlaced={vi.fn()} />
    );

    const resetBtn = container.querySelector('.btn-secondary');
    expect(resetBtn).not.toBeNull();
    expect(resetBtn!.textContent).toContain('Reset');
  });
});

describe('PlanePlacement - Hover Preview', () => {

  it('should show hover preview on mouse enter', () => {
    const { container } = render(
      <PlanePlacement onPlanesPlaced={vi.fn()} />
    );

    // Hover over cell at (5, 5) — should show preview cells
    const rows = container.querySelectorAll('.placement-board .board-row');
    const cell = rows[5].querySelectorAll('.cell')[5];

    fireEvent.mouseEnter(cell);

    const hoveredCells = container.querySelectorAll('.hovered-valid, .hovered-invalid');
    expect(hoveredCells.length).toBeGreaterThan(0);
  });

  it('should clear hover preview on mouse leave', () => {
    const { container } = render(
      <PlanePlacement onPlanesPlaced={vi.fn()} />
    );

    const rows = container.querySelectorAll('.placement-board .board-row');
    const cell = rows[5].querySelectorAll('.cell')[5];

    fireEvent.mouseEnter(cell);
    fireEvent.mouseLeave(cell);

    const hoveredCells = container.querySelectorAll('.hovered-valid, .hovered-invalid');
    expect(hoveredCells).toHaveLength(0);
  });

  it('should show valid hover for in-bounds placement', () => {
    const { container } = render(
      <PlanePlacement onPlanesPlaced={vi.fn()} />
    );

    const rows = container.querySelectorAll('.placement-board .board-row');
    const cell = rows[5].querySelectorAll('.cell')[5];

    fireEvent.mouseEnter(cell);

    const validCells = container.querySelectorAll('.hovered-valid');
    expect(validCells.length).toBeGreaterThan(0);
  });
});

describe('PlanePlacement - Plane Placement', () => {

  it('should place a plane on valid click', () => {
    const { container } = render(
      <PlanePlacement onPlanesPlaced={vi.fn()} />
    );

    const rows = container.querySelectorAll('.placement-board .board-row');
    const cell = rows[2].querySelectorAll('.cell')[5]; // head at (5,2), orientation up

    fireEvent.mouseEnter(cell);
    fireEvent.click(cell);

    // Board should now have placed plane cells
    const placedCells = container.querySelectorAll('.cell.plane, .cell.head');
    expect(placedCells.length).toBeGreaterThan(0);
  });

  it('should update planes count after placement', () => {
    const { container } = render(
      <PlanePlacement onPlanesPlaced={vi.fn()} />
    );

    const rows = container.querySelectorAll('.placement-board .board-row');
    const cell = rows[2].querySelectorAll('.cell')[5];

    fireEvent.mouseEnter(cell);
    fireEvent.click(cell);

    expect(container.textContent).toContain('Place 1 more plane');
  });

  it('should show confirm button after placing 2 planes', () => {
    const { container } = render(
      <PlanePlacement onPlanesPlaced={vi.fn()} />
    );

    const rows = container.querySelectorAll('.placement-board .board-row');

    // Place first plane at (2,2) UP — plane body extends down from head
    const cell1 = rows[2].querySelectorAll('.cell')[2];
    fireEvent.mouseEnter(cell1);
    fireEvent.click(cell1);

    // Place second plane at (7,2) UP — far enough to not overlap
    const cell2 = rows[2].querySelectorAll('.cell')[7];
    fireEvent.mouseEnter(cell2);
    fireEvent.click(cell2);

    const confirmBtn = container.querySelector('.btn-primary');
    expect(confirmBtn).not.toBeNull();
    expect(confirmBtn!.textContent).toContain('Confirm');
  });

  it('should call onPlanesPlaced when confirm is clicked', () => {
    const onPlanesPlaced = vi.fn();
    const { container } = render(
      <PlanePlacement onPlanesPlaced={onPlanesPlaced} />
    );

    const rows = container.querySelectorAll('.placement-board .board-row');

    // Place two non-overlapping planes
    const cell1 = rows[2].querySelectorAll('.cell')[2];
    fireEvent.mouseEnter(cell1);
    fireEvent.click(cell1);

    const cell2 = rows[2].querySelectorAll('.cell')[7];
    fireEvent.mouseEnter(cell2);
    fireEvent.click(cell2);

    const confirmBtn = container.querySelector('.btn-primary')!;
    fireEvent.click(confirmBtn);

    expect(onPlanesPlaced).toHaveBeenCalledOnce();
    expect(onPlanesPlaced).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ head_x: expect.any(Number), head_y: expect.any(Number), orientation: 'up' }),
      ])
    );
  });
});

describe('PlanePlacement - Shake Animation', () => {

  it('should add shake class on invalid placement click', () => {
    vi.useFakeTimers();

    const { container } = render(
      <PlanePlacement onPlanesPlaced={vi.fn()} />
    );

    const rows = container.querySelectorAll('.placement-board .board-row');

    // Hover over top-left corner with UP orientation — will be out of bounds
    const cell = rows[0].querySelectorAll('.cell')[0];
    fireEvent.mouseEnter(cell);

    // Verify it's an invalid hover
    const invalidCells = container.querySelectorAll('.hovered-invalid');
    expect(invalidCells.length).toBeGreaterThan(0);

    // Click on invalid placement
    fireEvent.click(cell);

    const board = container.querySelector('.placement-board');
    expect(board!.className).toContain('shake');

    vi.useRealTimers();
  });

  it('should remove shake class after timeout', () => {
    vi.useFakeTimers();

    const { container } = render(
      <PlanePlacement onPlanesPlaced={vi.fn()} />
    );

    const rows = container.querySelectorAll('.placement-board .board-row');
    const cell = rows[0].querySelectorAll('.cell')[0];

    fireEvent.mouseEnter(cell);
    fireEvent.click(cell);

    // Shake should be active
    expect(container.querySelector('.placement-board')!.className).toContain('shake');

    // After timeout, shake should be removed — wrap in act to flush state update
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(container.querySelector('.placement-board')!.className).not.toContain('shake');

    vi.useRealTimers();
  });

  it('should not place a plane when clicking on invalid position', () => {
    const { container } = render(
      <PlanePlacement onPlanesPlaced={vi.fn()} />
    );

    const rows = container.querySelectorAll('.placement-board .board-row');
    const cell = rows[0].querySelectorAll('.cell')[0];

    fireEvent.mouseEnter(cell);
    fireEvent.click(cell);

    // Should still say "Place 2 more planes" — nothing placed
    expect(container.textContent).toContain('Place 2 more planes');
  });
});

describe('PlanePlacement - Rotation', () => {

  it('should cycle through orientations on rotate button click', () => {
    const { container } = render(
      <PlanePlacement onPlanesPlaced={vi.fn()} />
    );

    const rotateBtn = container.querySelector('.btn-rotate')!;

    expect(rotateBtn.textContent).toContain('UP');

    fireEvent.click(rotateBtn);
    expect(rotateBtn.textContent).toContain('RIGHT');

    fireEvent.click(rotateBtn);
    expect(rotateBtn.textContent).toContain('DOWN');

    fireEvent.click(rotateBtn);
    expect(rotateBtn.textContent).toContain('LEFT');

    fireEvent.click(rotateBtn);
    expect(rotateBtn.textContent).toContain('UP');
  });
});

describe('PlanePlacement - Reset', () => {

  it('should clear board on reset', () => {
    const { container } = render(
      <PlanePlacement onPlanesPlaced={vi.fn()} />
    );

    const rows = container.querySelectorAll('.placement-board .board-row');

    // Place a plane
    const cell = rows[2].querySelectorAll('.cell')[5];
    fireEvent.mouseEnter(cell);
    fireEvent.click(cell);

    expect(container.querySelectorAll('.cell.plane, .cell.head').length).toBeGreaterThan(0);

    // Reset
    const resetBtn = container.querySelector('.btn-secondary')!;
    fireEvent.click(resetBtn);

    expect(container.querySelectorAll('.cell.plane, .cell.head')).toHaveLength(0);
    expect(container.textContent).toContain('Place 2 more planes');
  });
});
