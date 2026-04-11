import type { CellStatus } from './hooks/UseGameWebSocket';
import { getPlanePositions } from './helpers';

export interface PlaneColor {
  body: string;
  bodyDark: string;
  border: string;
  glow: string;
  head: string;
  headDark: string;
  headBorder: string;
  headGlow: string;
  cockpitGlow: string;
  swatch: string;
}

export interface PlanePalette {
  name: string;
  colors: PlaneColor[];
}

export type PlaneIndexMap = (number | null)[][];

const PALETTES: PlanePalette[] = [
  {
    name: 'Neon Ops',
    colors: [
      { body: '#00b8d9', bodyDark: '#0097b0', border: 'rgba(0,229,255,0.8)', glow: 'rgba(0,229,255,0.3)',
        head: '#00e5ff', headDark: '#00b8d9', headBorder: '#00e5ff', headGlow: 'rgba(0,229,255,0.4)',
        cockpitGlow: 'rgba(0,229,255,0.6)', swatch: '#00e5ff' },
      { body: '#d9246a', bodyDark: '#b01d57', border: 'rgba(255,45,138,0.8)', glow: 'rgba(255,45,138,0.3)',
        head: '#ff2d8a', headDark: '#d9246a', headBorder: '#ff2d8a', headGlow: 'rgba(255,45,138,0.4)',
        cockpitGlow: 'rgba(255,45,138,0.6)', swatch: '#ff2d8a' },
      { body: '#2dd95e', bodyDark: '#24b04c', border: 'rgba(57,255,110,0.8)', glow: 'rgba(57,255,110,0.3)',
        head: '#39ff6e', headDark: '#2dd95e', headBorder: '#39ff6e', headGlow: 'rgba(57,255,110,0.4)',
        cockpitGlow: 'rgba(57,255,110,0.6)', swatch: '#39ff6e' },
    ],
  },
  {
    name: 'Aurora Borealis',
    colors: [
      { body: '#22c09a', bodyDark: '#1a9d7d', border: 'rgba(46,232,192,0.8)', glow: 'rgba(46,232,192,0.3)',
        head: '#2ee8c0', headDark: '#22c09a', headBorder: '#2ee8c0', headGlow: 'rgba(46,232,192,0.4)',
        cockpitGlow: 'rgba(46,232,192,0.6)', swatch: '#2ee8c0' },
      { body: '#9044dd', bodyDark: '#7633bb', border: 'rgba(179,102,255,0.8)', glow: 'rgba(179,102,255,0.3)',
        head: '#b366ff', headDark: '#9044dd', headBorder: '#b366ff', headGlow: 'rgba(179,102,255,0.4)',
        cockpitGlow: 'rgba(179,102,255,0.6)', swatch: '#b366ff' },
      { body: '#d99a22', bodyDark: '#b07d1a', border: 'rgba(255,187,51,0.8)', glow: 'rgba(255,187,51,0.3)',
        head: '#ffbb33', headDark: '#d99a22', headBorder: '#ffbb33', headGlow: 'rgba(255,187,51,0.4)',
        cockpitGlow: 'rgba(255,187,51,0.6)', swatch: '#ffbb33' },
    ],
  },
  {
    name: 'Synthwave',
    colors: [
      { body: '#d9338e', bodyDark: '#b02873', border: 'rgba(255,68,170,0.8)', glow: 'rgba(255,68,170,0.3)',
        head: '#ff44aa', headDark: '#d9338e', headBorder: '#ff44aa', headGlow: 'rgba(255,68,170,0.4)',
        cockpitGlow: 'rgba(255,68,170,0.6)', swatch: '#ff44aa' },
      { body: '#3399dd', bodyDark: '#2877b3', border: 'rgba(68,187,255,0.8)', glow: 'rgba(68,187,255,0.3)',
        head: '#44bbff', headDark: '#3399dd', headBorder: '#44bbff', headGlow: 'rgba(68,187,255,0.4)',
        cockpitGlow: 'rgba(68,187,255,0.6)', swatch: '#44bbff' },
      { body: '#8e44cc', bodyDark: '#7333aa', border: 'rgba(170,85,255,0.8)', glow: 'rgba(170,85,255,0.3)',
        head: '#aa55ff', headDark: '#8e44cc', headBorder: '#aa55ff', headGlow: 'rgba(170,85,255,0.4)',
        cockpitGlow: 'rgba(170,85,255,0.6)', swatch: '#aa55ff' },
    ],
  },
  {
    name: 'Stealth Squadron',
    colors: [
      { body: '#00b077', bodyDark: '#008f60', border: 'rgba(0,214,143,0.8)', glow: 'rgba(0,214,143,0.3)',
        head: '#00d68f', headDark: '#00b077', headBorder: '#00d68f', headGlow: 'rgba(0,214,143,0.4)',
        cockpitGlow: 'rgba(0,214,143,0.6)', swatch: '#00d68f' },
      { body: '#d96e22', bodyDark: '#b05a1a', border: 'rgba(255,136,51,0.8)', glow: 'rgba(255,136,51,0.3)',
        head: '#ff8833', headDark: '#d96e22', headBorder: '#ff8833', headGlow: 'rgba(255,136,51,0.4)',
        cockpitGlow: 'rgba(255,136,51,0.6)', swatch: '#ff8833' },
      { body: '#33aad9', bodyDark: '#2888b0', border: 'rgba(68,204,255,0.8)', glow: 'rgba(68,204,255,0.3)',
        head: '#44ccff', headDark: '#33aad9', headBorder: '#44ccff', headGlow: 'rgba(68,204,255,0.4)',
        cockpitGlow: 'rgba(68,204,255,0.6)', swatch: '#44ccff' },
    ],
  },
  {
    name: 'Plasma Core',
    colors: [
      { body: '#d93360', bodyDark: '#b02850', border: 'rgba(255,68,119,0.8)', glow: 'rgba(255,68,119,0.3)',
        head: '#ff4477', headDark: '#d93360', headBorder: '#ff4477', headGlow: 'rgba(255,68,119,0.4)',
        cockpitGlow: 'rgba(255,68,119,0.6)', swatch: '#ff4477' },
      { body: '#00c09e', bodyDark: '#009d80', border: 'rgba(0,232,192,0.8)', glow: 'rgba(0,232,192,0.3)',
        head: '#00e8c0', headDark: '#00c09e', headBorder: '#00e8c0', headGlow: 'rgba(0,232,192,0.4)',
        cockpitGlow: 'rgba(0,232,192,0.6)', swatch: '#00e8c0' },
      { body: '#d9a822', bodyDark: '#b08a1a', border: 'rgba(255,200,50,0.8)', glow: 'rgba(255,200,50,0.3)',
        head: '#ffc832', headDark: '#d9a822', headBorder: '#ffc832', headGlow: 'rgba(255,200,50,0.4)',
        cockpitGlow: 'rgba(255,200,50,0.6)', swatch: '#ffc832' },
    ],
  },
  {
    name: 'Ghost Recon',
    colors: [
      { body: '#6e6ed9', bodyDark: '#5a5ab3', border: 'rgba(136,136,255,0.8)', glow: 'rgba(136,136,255,0.3)',
        head: '#8888ff', headDark: '#6e6ed9', headBorder: '#8888ff', headGlow: 'rgba(136,136,255,0.4)',
        cockpitGlow: 'rgba(136,136,255,0.6)', swatch: '#8888ff' },
      { body: '#00b560', bodyDark: '#00943e', border: 'rgba(0,221,119,0.8)', glow: 'rgba(0,221,119,0.3)',
        head: '#00dd77', headDark: '#00b560', headBorder: '#00dd77', headGlow: 'rgba(0,221,119,0.4)',
        cockpitGlow: 'rgba(0,221,119,0.6)', swatch: '#00dd77' },
      { body: '#d9564a', bodyDark: '#b3453c', border: 'rgba(255,107,91,0.8)', glow: 'rgba(255,107,91,0.3)',
        head: '#ff6b5b', headDark: '#d9564a', headBorder: '#ff6b5b', headGlow: 'rgba(255,107,91,0.4)',
        cockpitGlow: 'rgba(255,107,91,0.6)', swatch: '#ff6b5b' },
    ],
  },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function getRandomPalette(): PlanePalette {
  const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
  return { ...palette, colors: shuffle(palette.colors) };
}

export function planeColorVars(color: PlaneColor): React.CSSProperties {
  return {
    '--pc-body': color.body,
    '--pc-body-dark': color.bodyDark,
    '--pc-border': color.border,
    '--pc-glow': color.glow,
    '--pc-head': color.head,
    '--pc-head-dark': color.headDark,
    '--pc-head-border': color.headBorder,
    '--pc-head-glow': color.headGlow,
    '--pc-cockpit-glow': color.cockpitGlow,
  } as React.CSSProperties;
}

/**
 * Build a 10x10 map of which plane index (0, 1, 2) each cell belongs to.
 * Uses shape-matching from heads to identify planes and their orientation.
 */
export function buildPlaneIndexMap(board: CellStatus[][]): PlaneIndexMap {
  const map: PlaneIndexMap = Array.from({ length: 10 }, () => Array(10).fill(null));

  const heads: { x: number; y: number }[] = [];
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      if (board[y][x] === 'head' || board[y][x] === 'head_hit') {
        heads.push({ x, y });
      }
    }
  }
  heads.sort((a, b) => a.y - b.y || a.x - b.x);

  const orientations: ('up' | 'down' | 'left' | 'right')[] = ['up', 'down', 'left', 'right'];

  heads.forEach((head, planeIdx) => {
    for (const orient of orientations) {
      const { positions } = getPlanePositions(head.x, head.y, orient);
      const allInBounds = positions.every(
        (p: { x: number; y: number }) => p.x >= 0 && p.x < 10 && p.y >= 0 && p.y < 10
      );
      if (!allInBounds) continue;

      const allMatch = positions.every((pos: { x: number; y: number }, i: number) => {
        const cell = board[pos.y][pos.x];
        if (i === 0) return cell === 'head' || cell === 'head_hit';
        return cell === 'plane' || cell === 'hit';
      });

      if (allMatch) {
        positions.forEach((pos: { x: number; y: number }) => {
          map[pos.y][pos.x] = planeIdx;
        });
        break;
      }
    }
  });

  return map;
}
