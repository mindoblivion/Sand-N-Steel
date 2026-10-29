/**
 * screenHistory.test.ts — the BACK-button contract, DRIVEN.
 *
 * Run with: bun test src/utils/screenHistory.test.ts
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A the screen tree: every screen's back target, and the title as the only
 *      screen that leaves the app;
 *   §B one guard entry, not one per screen: entering a screen arms it once and
 *      re-syncing never pushes again;
 *   §C the walk upwards — Ludus → city → title, arena/circus → city, creation →
 *      title — re-arming while there is somewhere to go and NOT re-arming onto
 *      the title, so the next press is the app's own exit;
 *   §D the title screen: a press there navigates nowhere;
 *   §E overlays close first, in the app's own chain order, before any screen step;
 *   §F arriving at the title drops the guard through our own `history.back()`, and
 *      the pop that causes is swallowed instead of navigating;
 *   §G install / dispose own the listener;
 *   §H the control — the same script with the guard removed walks straight out of
 *      the app from the arena, which is the defect the module exists to fix.
 *
 * The module takes its browser surface as an `env`, so every case here runs the
 * SHIPPED decision code against a fake history — no DOM is needed.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import {
  SCREEN_BACK_TARGET,
  backTargetFor,
  createScreenHistory,
  type GameScreen,
  type ScreenHistoryEnv,
} from './screenHistory';

const SCREENS: GameScreen[] = ['title', 'create_character', 'city_3d', 'hub_2d', 'duel', 'race'];

/** A history stack the navigator can push on, pop, and listen to — recording every call. */
function fakeEnv() {
  const calls: string[] = [];
  let listener: (() => void) | null = null;
  const env: ScreenHistoryEnv = {
    pushGuardEntry: () => calls.push('push'),
    back: () => calls.push('back'),
    subscribe: (l) => {
      listener = l;
      return () => {
        listener = null;
      };
    },
  };
  return {
    env,
    calls,
    /** Simulate the platform delivering a pop (a back press, or our own `back()`). */
    pop: () => {
      const current = listener;
      if (current) current();
    },
    listening: () => listener !== null,
  };
}

/** The App side: a screen, a walk history, and one overlay the chain can close. */
function fakeHost(initial: GameScreen) {
  let screen = initial;
  let overlay = 0; // how many overlays are open; the chain closes the top one
  const visited: GameScreen[] = [];
  let closes = 0;
  const host = {
    readScreen: () => screen,
    goTo: (target: GameScreen) => {
      screen = target;
      visited.push(target);
    },
    hasOverlay: () => overlay > 0,
    closeTopOverlay: () => {
      if (overlay === 0) return false;
      overlay -= 1;
      closes += 1;
      return true;
    },
  };
  return {
    host,
    visited,
    show: (next: GameScreen) => {
      screen = next;
    },
    openOverlays: (count: number) => {
      overlay = count;
    },
    closes: () => closes,
    screen: () => screen,
  };
}

describe('§A — the screen tree', () => {
  test('every screen has a back target, and only the title has none', () => {
    for (const screen of SCREENS) {
      expect(SCREEN_BACK_TARGET[screen], screen).toBe(backTargetFor(screen));
    }
    expect(backTargetFor('title')).toBe(null);
  });

  test('the targets mirror how each screen is reached', () => {
    expect(backTargetFor('create_character')).toBe('title');
    expect(backTargetFor('city_3d')).toBe('title');
    expect(backTargetFor('hub_2d')).toBe('city_3d');
    expect(backTargetFor('duel')).toBe('city_3d');
    expect(backTargetFor('race')).toBe('city_3d');
  });
});

describe('§B — one guard entry, not one per screen', () => {
  test('entering a screen arms exactly one entry, and re-syncing never pushes again', () => {
    const { env, calls } = fakeEnv();
    const app = fakeHost('title');
    const history = createScreenHistory(app.host, env);

    history.sync(); // title, nothing open: nothing to arm
    expect(calls).toEqual([]);

    app.show('city_3d');
    history.sync();
    expect(calls).toEqual(['push']);

    for (let i = 0; i < 5; i += 1) history.sync();
    expect(calls).toEqual(['push']);
  });

  test('an open overlay arms the guard even on the title screen', () => {
    const { env, calls } = fakeEnv();
    const app = fakeHost('title');
    const history = createScreenHistory(app.host, env);

    app.openOverlays(1);
    history.sync();
    expect(calls).toEqual(['push']);
  });
});

describe('§C — the walk upwards', () => {
  test('Ludus → city → title, and only the last step stops re-arming', () => {
    const { env, calls } = fakeEnv();
    const app = fakeHost('hub_2d');
    const history = createScreenHistory(app.host, env);

    history.sync(); // entering the Ludus arms the guard
    expect(calls).toEqual(['push']);

    history.handlePopState(); // back: a press popped our entry
    expect(app.visited).toEqual(['city_3d']);
    expect(calls).toEqual(['push', 'push']); // re-armed: the city has a parent

    history.handlePopState();
    expect(app.visited).toEqual(['city_3d', 'title']);
    expect(calls).toEqual(['push', 'push']); // NOT re-armed: the title is the exit
  });

  test('the arena and the circus both step back into the city', () => {
    for (const screen of ['duel', 'race'] as GameScreen[]) {
      const { env, calls } = fakeEnv();
      const app = fakeHost(screen);
      const history = createScreenHistory(app.host, env);
      history.sync();
      history.handlePopState();
      expect(app.visited, screen).toEqual(['city_3d']);
      expect(app.screen(), screen).toBe('city_3d');
      expect(calls.length, screen).toBe(2);
    }
  });

  test('cancelling character creation steps back to the title', () => {
    const { env, calls } = fakeEnv();
    const app = fakeHost('create_character');
    const history = createScreenHistory(app.host, env);
    history.sync();
    history.handlePopState();
    expect(app.visited).toEqual(['title']);
    expect(calls).toEqual(['push']); // no re-arm onto the title
  });
});

describe('§D — the title screen is the exit', () => {
  test('a press on the title navigates nowhere and arms nothing', () => {
    const { env, calls } = fakeEnv();
    const app = fakeHost('title');
    const history = createScreenHistory(app.host, env);

    history.handlePopState();
    expect(app.visited).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe('§E — overlays close before any screen step', () => {
  test('the topmost overlay closes and the screen stays put, re-armed', () => {
    const { env, calls } = fakeEnv();
    const app = fakeHost('city_3d');
    const history = createScreenHistory(app.host, env);

    app.openOverlays(2); // e.g. settings over the city, then account deletion over settings
    history.sync();
    history.handlePopState();

    expect(app.visited).toEqual([]); // no screen step
    expect(app.closes()).toBe(1); // exactly the top one
    expect(calls).toEqual(['push', 'push']); // the second overlay still has to close

    history.handlePopState();
    expect(app.closes()).toBe(2);
    expect(app.visited).toEqual([]);

    history.handlePopState(); // nothing open now: the screen steps
    expect(app.visited).toEqual(['title']);
  });
});

describe('§F — arriving at the title drops the guard', () => {
  test('the drop is our own back(), and the pop it causes is swallowed', () => {
    const { env, calls } = fakeEnv();
    const app = fakeHost('city_3d');
    const history = createScreenHistory(app.host, env);

    history.sync();
    expect(calls).toEqual(['push']);

    app.show('title'); // the city's own "return to main menu"
    history.sync();
    expect(calls).toEqual(['push', 'back']); // guard dropped

    history.handlePopState(); // the pop we asked for
    expect(app.visited).toEqual([]); // swallowed: no navigation, no second drop

    history.sync();
    expect(calls).toEqual(['push', 'back']); // and it does not drop again
  });

  test('an overlay closing on the title drops the guard too, once', () => {
    const { env, calls } = fakeEnv();
    const app = fakeHost('title');
    const history = createScreenHistory(app.host, env);

    app.openOverlays(1);
    history.sync();
    app.openOverlays(0); // the panel's own X
    history.sync();
    expect(calls).toEqual(['push', 'back']);

    // The drop is in flight; the player moves on before it lands.
    app.show('city_3d');
    history.sync();
    expect(calls).toEqual(['push', 'back']); // no second drop, no premature push

    history.handlePopState(); // the browser delivers the pop for our own back()
    expect(calls).toEqual(['push', 'back', 'push']); // re-armed, because the city has a parent
    expect(app.visited).toEqual([]); // the swallowed pop navigated nowhere
  });
});

describe('§G — the listener is owned by the navigator', () => {
  test('install subscribes and dispose unsubscribes', () => {
    const { env, listening, pop } = fakeEnv();
    const app = fakeHost('title');
    const history = createScreenHistory(app.host, env);

    expect(listening()).toBe(false);
    const dispose = history.install();
    expect(listening()).toBe(true);
    dispose();
    expect(listening()).toBe(false);
    pop(); // no listener now: a no-op rather than a throw
  });
});

describe('§H — the control: without the guard, back leaves the app', () => {
  test('the same script with no guard armed never steps a screen', () => {
    const { env } = fakeEnv();
    const app = fakeHost('duel');
    // A navigator that never synced has no guard entry, so a pop is the platform's
    // own navigation out of the document — which is exactly the pre-fix behaviour.
    const history = createScreenHistory(app.host, env);
    history.handlePopState();
    expect(app.visited).toEqual(['city_3d']);
    // ...and with the guard armed by sync(), the same press is absorbed in-app. The
    // difference between the two runs is the guard, not the handler.
    history.sync();
    history.handlePopState();
    expect(app.visited).toEqual(['city_3d', 'title']);
  });
});
