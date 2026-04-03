import { useState, useRef, useEffect, useCallback, ReactNode } from 'react';
import './ZoomableBoard.css';

interface ZoomableBoardProps {
  children: ReactNode;
}

const ZoomableBoard = ({ children }: ZoomableBoardProps) => {
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef({ startDist: 0, startScale: 1 });
  const scaleRef = useRef(1);

  scaleRef.current = scale;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const getDist = (touches: TouchList) =>
      Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY
      );

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchRef.current = {
          startDist: getDist(e.touches),
          startScale: scaleRef.current,
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = getDist(e.touches);
        const ratio = dist / pinchRef.current.startDist;
        setScale(Math.min(2.5, Math.max(1, pinchRef.current.startScale * ratio)));
      }
    };

    const onTouchEnd = () => {
      if (scaleRef.current < 1.05) setScale(1);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  const resetZoom = useCallback(() => setScale(1), []);

  return (
    <div
      ref={containerRef}
      className={`zoomable-wrapper ${scale > 1 ? 'zoomed' : ''}`}
      style={{ touchAction: scale > 1 ? 'none' : 'manipulation' }}
    >
      <div
        className="zoomable-content"
        style={{ transform: `scale(${scale})` }}
      >
        {children}
      </div>
      {scale > 1 && (
        <button className="zoom-reset-btn" onClick={resetZoom}>
          Reset Zoom
        </button>
      )}
    </div>
  );
};

export default ZoomableBoard;
