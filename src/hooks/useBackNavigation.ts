/**
 * useBackNavigation.ts — binds `utils/screenHistory` to the App's own state.
 *
 * The navigator instance is created ONCE (it holds whether the guard entry is on the
 * stack) and reads the current screen / overlay through a ref, so the pop listener
 * installed on mount never sees a stale closure and never needs reinstalling when the
 * screen changes. `sync()` runs after every render that could change what is
 * back-able.
 */
import { useEffect, useMemo, useRef } from 'react';
import { browserScreenHistoryEnv, createScreenHistory, type GameScreen } from '../utils/screenHistory';

interface BackNavigationOptions {
  /** The screen on display. */
  screen: GameScreen;
  /** Show a screen in response to a back press. */
  goTo: (screen: GameScreen) => void;
  /** Is any overlay open above the screen? */
  overlayOpen: boolean;
  /** Close the topmost overlay; `false` when there was none. */
  closeTopOverlay: () => boolean;
}

export function useBackNavigation({ screen, goTo, overlayOpen, closeTopOverlay }: BackNavigationOptions): void {
  const latest = useRef({ screen, goTo, overlayOpen, closeTopOverlay });
  latest.current = { screen, goTo, overlayOpen, closeTopOverlay };

  const navigator = useMemo(
    () =>
      createScreenHistory(
        {
          readScreen: () => latest.current.screen,
          goTo: (target) => latest.current.goTo(target),
          hasOverlay: () => latest.current.overlayOpen,
          closeTopOverlay: () => latest.current.closeTopOverlay(),
        },
        browserScreenHistoryEnv()
      ),
    []
  );

  useEffect(() => navigator.install(), [navigator]);
  useEffect(() => navigator.sync(), [navigator, screen, overlayOpen]);
}
