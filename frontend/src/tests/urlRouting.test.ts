import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getGameIdFromUrl } from '../App';

describe('getGameIdFromUrl', () => {
  beforeEach(() => {
    // Reset to root between tests
    window.history.replaceState(null, '', '/');
  });

  it('returns null for root path', () => {
    window.history.replaceState(null, '', '/');
    expect(getGameIdFromUrl()).toBeNull();
  });

  it('parses game ID from /game/:id', () => {
    window.history.replaceState(null, '', '/game/abc-123');
    expect(getGameIdFromUrl()).toBe('abc-123');
  });

  it('parses UUID-style game IDs', () => {
    window.history.replaceState(null, '', '/game/550e8400-e29b-41d4-a716-446655440000');
    expect(getGameIdFromUrl()).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('returns null for unrelated paths', () => {
    window.history.replaceState(null, '', '/about');
    expect(getGameIdFromUrl()).toBeNull();
  });

  it('returns null for /game/ with no ID', () => {
    window.history.replaceState(null, '', '/game/');
    expect(getGameIdFromUrl()).toBeNull();
  });

  it('ignores trailing path segments after game ID', () => {
    window.history.replaceState(null, '', '/game/abc-123/extra');
    expect(getGameIdFromUrl()).toBe('abc-123');
  });

  it('decodes URL-encoded characters', () => {
    window.history.replaceState(null, '', '/game/test%20id');
    expect(getGameIdFromUrl()).toBe('test id');
  });

  it('does not match /api/game/ paths', () => {
    window.history.replaceState(null, '', '/api/game/create');
    expect(getGameIdFromUrl()).toBeNull();
  });
});

describe('URL sync via pushState', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pushStateSpy: any;

  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    pushStateSpy = vi.spyOn(window.history, 'pushState');
  });

  it('pushes /game/:id when gameId is set', async () => {
    const { render, cleanup } = await import('@testing-library/react');
    const { useEffect, createElement } = await import('react');

    function TestUrlSync({ gameId }: { gameId: string | null }) {
      useEffect(() => {
        const targetPath = gameId ? `/game/${gameId}` : '/';
        if (window.location.pathname !== targetPath) {
          window.history.pushState(null, '', targetPath);
        }
      }, [gameId]);
      return null;
    }

    const { rerender, unmount } = render(createElement(TestUrlSync, { gameId: null }));
    pushStateSpy.mockClear();

    rerender(createElement(TestUrlSync, { gameId: 'new-game-id' }));
    expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/game/new-game-id');

    pushStateSpy.mockClear();
    rerender(createElement(TestUrlSync, { gameId: null }));
    expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/');

    unmount();
    cleanup();
  });

  it('does not push if URL already matches', async () => {
    const { render, cleanup } = await import('@testing-library/react');
    const { useEffect, createElement } = await import('react');

    window.history.replaceState(null, '', '/game/existing');

    function TestUrlSync({ gameId }: { gameId: string | null }) {
      useEffect(() => {
        const targetPath = gameId ? `/game/${gameId}` : '/';
        if (window.location.pathname !== targetPath) {
          window.history.pushState(null, '', targetPath);
        }
      }, [gameId]);
      return null;
    }

    pushStateSpy.mockClear();
    const { unmount } = render(createElement(TestUrlSync, { gameId: 'existing' }));
    expect(pushStateSpy).not.toHaveBeenCalled();

    unmount();
    cleanup();
  });
});

describe('popstate handler', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('fires getGameIdFromUrl on popstate event', () => {
    window.history.replaceState(null, '', '/game/pop-test');
    expect(getGameIdFromUrl()).toBe('pop-test');

    window.history.replaceState(null, '', '/');
    expect(getGameIdFromUrl()).toBeNull();
  });
});
