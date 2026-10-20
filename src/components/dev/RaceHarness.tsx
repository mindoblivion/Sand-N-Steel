import React, { useCallback, useState } from 'react';
import { RaceScene } from '../3d/RaceScene';

/**
 * RaceHarness.tsx — Phase C-8.70B Stage 1, Slice 2: a DEVELOPMENT-ONLY mount of
 * the REAL race scene.
 *
 * ── Why it exists ─────────────────────────────────────────────────────────
 * The race is one screen of the shipped game, reached only through the title
 * screen, character creation, the 3D city hub, a fast travel and the district's
 * own signpost.  In this sandbox the city hub renders through SwiftShader at
 * ~1.5–2 fps, so that route costs more wall time than a verification script is
 * allowed — the limit C-8.36, C-8.37, C-8.55, C-8.64A, C-8.65 and C-8.68C all
 * recorded.  This mounts the SAME component the game mounts (`RaceScene`, the
 * real arena, the real chariot, the real state machine, the real controls and
 * HUD) with no route to walk, so driving can actually be exercised: the touch
 * controls, the keyboard, the countdown, the launch and the chase camera are the
 * shipping ones, not a copy.
 *
 * ── What it is not ────────────────────────────────────────────────────────
 * It is not a second race scene, it renders no alternative geometry, it reads
 * and writes NO storage (neither does `RaceScene`), it is reachable only in a
 * dev build, and it is imported nowhere except `main.tsx`'s `import.meta.env.DEV`
 * branch.  Its own module carries the same self-guard, so mounting it outside a
 * dev build is impossible.  Removal: delete this file and revert that branch.
 */
export const RaceHarness: React.FC = () => {
  const [run, setRun] = useState(0);
  const restart = useCallback(() => setRun((value) => value + 1), []);

  if (!import.meta.env.DEV) return null;

  return (
    <div className="relative w-full h-full min-h-[100dvh] bg-neutral-950 overflow-hidden">
      {/* A real race ends by handing control back to whoever mounted it; here
          that is a fresh race, so the harness can be driven more than once. */}
      <RaceScene key={run} onAbort={restart} />
      <button
        type="button"
        data-race-harness="restart"
        onClick={restart}
        className="absolute top-20 left-3 z-40 px-3 py-1.5 rounded-xl bg-neutral-900/90 border border-amber-600/60 text-[10px] font-mono uppercase tracking-wider text-amber-200 hover:text-amber-100 cursor-pointer"
      >
        rerun the race (dev)
      </button>
    </div>
  );
};
