import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import type { CellStatus } from './UseGameWebSocket';
import { type PlanePalette, getRandomPalette, buildPlaneIndexMap, planeColorVars } from '../planeColors';

const PlaneColorCtx = createContext<PlanePalette>(getRandomPalette());

interface ProviderProps {
  gameId: string | null;
  children: ReactNode;
}

export function PlaneColorProvider({ gameId, children }: ProviderProps) {
  const [palette, setPalette] = useState<PlanePalette>(() => getRandomPalette());
  useEffect(() => { setPalette(getRandomPalette()); }, [gameId]);
  return <PlaneColorCtx.Provider value={palette}>{children}</PlaneColorCtx.Provider>;
}

export function usePlaneColors(): PlanePalette {
  return useContext(PlaneColorCtx);
}

export function useBoardColors(board: CellStatus[][]) {
  const palette = usePlaneColors();
  const planeMap = useMemo(() => buildPlaneIndexMap(board), [board]);

  const getStyle = (x: number, y: number): React.CSSProperties | undefined => {
    const pidx = planeMap[y]?.[x];
    if (pidx == null) return undefined;
    return planeColorVars(palette.colors[pidx]);
  };

  return { palette, getStyle };
}
