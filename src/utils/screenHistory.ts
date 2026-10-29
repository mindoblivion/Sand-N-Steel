/**
 * screenHistory.ts — the ONE contract for what the browser/Android BACK button does.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * The game has no router: `App.tsx` is one document that switches a `GameScreen`
 * value, so the address bar never changes and the history stack holds exactly one
 * entry. On Android that means the hardware/system back gesture leaves the document
 * outright — from the arena, from character creation, from anywhere — which is the
 * first thing a standalone-usability review presses. This module gives back a meaning
 * inside the game: it walks the screen tree upwards, closes the topmost overlay
 * first, and leaves the app only from the title screen, where there is genuinely
 * nothing behind it.
 *
 * ── HOW ───────────────────────────────────────────────────────────────────
 * One *guard* entry, not one entry per screen. While anything is back-able (a
 * non-title screen, or an open overlay) exactly one extra history entry sits on top
 * of the document. A back press pops that guard, the guard handler decides where the
 * player should be and re-arms it if there is still somewhere to go. History depth
 * therefore stays at two, so a long session cannot turn "leave the app" into twenty
 * back presses, and screen transitions the player never asked for (a settled duel
 * returning to the city) never leave entries behind.
 *
 * The one deliberate exception is arriving at the title screen: with nothing left to
 * go back to, the guard is dropped (`history.back()` on our own entry) and the pop it
 * causes is ignored, so the NEXT back press is the app's own exit.
 *
 * ── WHAT IT DOES NOT DO ───────────────────────────────────────────────────
 * It pushes no URL and renders nothing: the address never changes, so a back press
 * never reloads the game. It is handed an `env`, so the whole decision table can be
 * driven in a test without a DOM (`screenHistory.test.ts`).
 */

/** The app's screens. `App.tsx` owns these ids; this module owns what back means. */
export type GameScreen = 'title' | 'create_character' | 'city_3d' | 'hub_2d' | 'duel' | 'race';

/**
 * Where a back press goes from each screen. `null` is the title screen — the one
 * place where back is allowed to leave the app, because nothing in the game sits
 * behind it.
 *
 * The parents mirror how each screen is actually reached: the Ludus is opened from
 * the city, the arena and the circus from the city, character creation from the
 * title, and the city from the title.
 */
export const SCREEN_BACK_TARGET: Readonly<Record<GameScreen, GameScreen | null>> = {
  title: null,
  create_character: 'title',
  city_3d: 'title',
  hub_2d: 'city_3d',
  duel: 'city_3d',
  race: 'city_3d',
};

/** The screen a back press from `screen` should show, or `null` to leave the app. */
export function backTargetFor(screen: GameScreen): GameScreen | null {
  return SCREEN_BACK_TARGET[screen] ?? null;
}

/** What the guard entry carries. Never read back — its presence is the whole signal. */
const GUARD_STATE = { sandAndSteelGuard: true } as const;

/** What the navigator needs from the running app (the App component supplies these). */
export interface ScreenHistoryHost {
  /** The screen on display right now. */
  readScreen(): GameScreen;
  /** Show a screen. Called only from the guard handler. */
  goTo(screen: GameScreen): void;
  /** Is any overlay (dialog, panel, result card) open above the screen? */
  hasOverlay(): boolean;
  /** Close the topmost overlay. Returns `false` when there was none to close. */
  closeTopOverlay(): boolean;
}

/** The browser surface the navigator uses — replaced by a fake in tests. */
export interface ScreenHistoryEnv {
  /** Add one history entry above the current one. */
  pushGuardEntry(): void;
  /** Step the history back one entry. */
  back(): void;
  /** Listen for a pop. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

/** The real `window.history` / `window` binding. */
export function browserScreenHistoryEnv(): ScreenHistoryEnv {
  return {
    pushGuardEntry: () => window.history.pushState(GUARD_STATE, ''),
    back: () => window.history.back(),
    subscribe: (listener) => {
      window.addEventListener('popstate', listener);
      return () => window.removeEventListener('popstate', listener);
    },
  };
}

export interface ScreenHistory {
  /** Attach the pop listener. Returns the detach function. */
  install(): () => void;
  /** Call after every render that could change screen or overlay state. */
  sync(): void;
  /** The guard handler. Public so a test can drive it; the listener calls it. */
  handlePopState(): void;
}

export function createScreenHistory(host: ScreenHistoryHost, env: ScreenHistoryEnv): ScreenHistory {
  /** Is our guard entry currently on the stack, above the document's own entry? */
  let guardArmed = false;
  /** True while we are backing off our own guard (arriving at the title screen). */
  let droppingGuard = false;

  const arm = () => {
    if (guardArmed) return;
    env.pushGuardEntry();
    guardArmed = true;
  };

  /**
   * A back press. The guard entry has just been popped, so `guardArmed` is cleared
   * first: anything that arms it again below is a fresh entry for the next press.
   */
  const handlePopState = () => {
    if (droppingGuard) {
      // This is the pop we asked for when the player arrived somewhere with nothing
      // behind it (the title screen). Nothing to navigate: the next press is the exit.
      // If the screen changed while the drop was in flight, the guard is re-armed here
      // — the one place that knows the entry is really gone.
      droppingGuard = false;
      if (host.hasOverlay() || host.readScreen() !== 'title') arm();
      return;
    }
    guardArmed = false;
    // An open dialog is the topmost thing on screen, so it closes first and the
    // screen underneath stays put.
    if (host.closeTopOverlay()) {
      arm();
      return;
    }
    const target = backTargetFor(host.readScreen());
    if (target === null) return; // title: let this press leave the app
    host.goTo(target);
    // Re-arm unless we landed on the title, which is the one screen with no parent.
    if (target !== 'title') arm();
  };

  /**
   * Reconcile the guard with what is on screen: armed while anything is back-able,
   * dropped (once) when nothing is.
   */
  const sync = () => {
    if (droppingGuard) return;
    if (host.hasOverlay() || host.readScreen() !== 'title') {
      arm();
      return;
    }
    if (!guardArmed) return;
    // Nothing left to go back to. Our guard entry is the current one by construction,
    // so this returns to the document's own entry — same page, no navigation — and
    // the pop it causes is swallowed above. `sync` stays quiet until that pop lands
    // (the handler re-arms if the player has moved on in the meantime), because a push
    // now would be the entry the pending back() consumed.
    guardArmed = false;
    droppingGuard = true;
    env.back();
  };

  return {
    install: () => env.subscribe(handlePopState),
    sync,
    handlePopState,
  };
}
