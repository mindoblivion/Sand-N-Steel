import React, { useEffect, useMemo, useRef, useState } from 'react';
import { sounds } from '../../audio/soundEffects';
import {
  OATH_CLOSING_LINE,
  OATH_FRAMING_LINE,
  OATH_LINES,
  OATH_SCENE_LABEL,
  OATH_SKIP_LABEL,
  oathCurrentLine,
  oathHoldProgress,
  oathLineText,
  startOathBeat,
  stepOathBeat,
  type OathBeatMode,
  type OathBeatState,
} from '../../utils/gladiatorOath';

export interface OathBeatProps {
  /** `full` for a gladiator who still owes the words; `skip` for one who already has them. */
  mode: OathBeatMode;
  /** Called ONCE, on completion, with the finished beat — the caller decides what completes. */
  onComplete: (finalState: OathBeatState) => void;
}

/**
 * The gladiator's oath — the presented scene the Doctore closes a new arrival with.
 *
 * ── WHAT IT IS ───────────────────────────────────────────────────────────
 * A panel scene over the Ludus Martial Yard, which the city is mounted at and lit for
 * (see `OATH_YARD_SPAWN` and the city's `oathDawn` rig): the Doctore's framing line,
 * then the four oath lines one at a time — each in Latin WITH its gloss on the same
 * line — then the closing vow. Every line completes ONLY on a press-and-hold; there
 * is no fail state and no clock of its own.
 *
 * ── THE THREE INPUT PATHS ARE ONE PATH ───────────────────────────────────
 * A touch press, a mouse hold and a held Space bar all write the SAME `pressedRef`
 * flag, and the state machine is fed that flag and a frame delta — so the machine
 * never learns which device asked, and the three cannot drift apart in behaviour.
 * Releases are taken from the WINDOW, not from the control, so a hold that wanders
 * off the panel still releases (and a tab switch cannot leave the press stuck down).
 *
 * ── ONE SOUND ────────────────────────────────────────────────────────────
 * A single shield-strike from the existing audio engine, on completion — the beat's
 * only sound, and the same `sounds.playBlock()` the duel's blocks use. No new audio
 * file, no new engine call.
 *
 * ── WHAT IT DOES NOT DO ──────────────────────────────────────────────────
 * It writes nothing: it reports the finished beat upward through `onComplete`, and
 * `App` is the one that touches the profile (through `withOathSworn`). Abandoning the
 * beat writes nothing, because nothing here can write.
 */
export const OathBeat: React.FC<OathBeatProps> = ({ mode, onComplete }) => {
  const [beat, setBeat] = useState<OathBeatState>(() => startOathBeat(mode));
  const pressedRef = useRef(false);
  const lastFrameRef = useRef(0);
  const completedRef = useRef(false);

  // The beat's only clock: while the press is down, one step per frame — so a hidden
  // tab stops the clock with it and a hold can never complete on its own.
  useEffect(() => {
    let raf = 0;
    lastFrameRef.current = performance.now();
    const loop = (now: number) => {
      const deltaMs = now - lastFrameRef.current;
      lastFrameRef.current = now;
      const pressed = pressedRef.current;
      setBeat((prev) => stepOathBeat(prev, { pressed, deltaMs }));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Every release and the Space path, at the window: the pointer is free to leave the
  // control mid-hold, and the press is always cleared when the tab loses focus.
  useEffect(() => {
    const release = () => {
      pressedRef.current = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.key !== ' ') return;
      event.preventDefault();
      if (!event.repeat) pressedRef.current = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.key !== ' ') return;
      event.preventDefault();
      pressedRef.current = false;
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', release);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('blur', release);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Completion: one shield struck, once, and the finished beat handed over.
  useEffect(() => {
    if (beat.phase !== 'sworn' || completedRef.current) return;
    completedRef.current = true;
    sounds.playBlock();
    onComplete(beat);
  }, [beat, onComplete]);

  const progress = oathHoldProgress(beat);
  const swornLines = useMemo(() => {
    if (beat.phase === 'skip') return [];
    // Every line whose words have been said: the ones behind the cursor, plus the
    // cursor's own once the closing vow is up.
    const count = beat.phase === 'closing' || beat.phase === 'sworn' ? OATH_LINES.length : beat.line;
    return OATH_LINES.slice(0, count);
  }, [beat.phase, beat.line]);
  const asking = beat.phase === 'skip' ? OATH_SKIP_LABEL : beat.phase === 'closing' ? OATH_CLOSING_LINE : oathLineText(oathCurrentLine(beat));

  return (
    <div
      data-oath-beat={mode}
      role="group"
      aria-label="The gladiator's oath"
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-neutral-950/75"
    >
      <div
        data-oath-phase={beat.phase}
        data-oath-line={beat.line}
        data-oath-holds={beat.holds}
        className="w-[min(94vw,34rem)] max-h-[88dvh] overflow-y-auto rounded-3xl border-2 border-amber-600/60 bg-neutral-950/95 px-4 py-5 sm:px-6 sm:py-6 shadow-[0_0_50px_rgba(245,158,11,0.25)] text-amber-100 animate-fadeIn"
      >
        <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-amber-400/80">
          {OATH_SCENE_LABEL}
        </p>

        <p className="mt-2 font-serif text-[13px] sm:text-sm leading-relaxed text-amber-200">
          {OATH_FRAMING_LINE}
        </p>

        {/* WHAT HAS BEEN SWORN — the litany, growing one line at a time. */}
        {swornLines.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1">
            {swornLines.map((line) => (
              <li
                key={line.latin}
                data-oath-sworn={line.latin}
                className="flex items-baseline gap-2 font-serif text-[12px] sm:text-[13px] text-neutral-400"
              >
                <span className="text-amber-500">✓</span>
                <span>{oathLineText(line)}</span>
              </li>
            ))}
          </ul>
        )}

        {/* THE LINE BEING ASKED FOR — it completes only on the hold below. */}
        <div className="mt-4 rounded-2xl border border-amber-800/50 bg-neutral-900/70 px-3 py-3">
          <span className="block text-[10px] font-mono uppercase tracking-[0.16em] text-amber-400/80">
            {beat.phase === 'skip'
              ? 'The Doctore knows your name already'
              : beat.phase === 'closing'
                ? 'The vow'
                : `Line ${beat.line + 1} of ${OATH_LINES.length}`}
          </span>
          <span
            data-oath-asking={beat.phase}
            className="mt-1 block font-serif text-sm sm:text-base text-amber-50"
          >
            {asking}
          </span>
        </div>

        {/* THE HOLD. Touch, mouse and Space all land on this one control. */}
        <button
          type="button"
          data-oath-hold="1"
          aria-label={beat.phase === 'skip' ? `Hold to skip: ${OATH_SKIP_LABEL}` : `Hold to swear: ${asking}`}
          onPointerDown={(event) => {
            // preventDefault stops the long-press selection/context gesture; the
            // `touch-none` class stops the hold being read as a scroll.
            event.preventDefault();
            pressedRef.current = true;
          }}
          onContextMenu={(event) => event.preventDefault()}
          className="mt-3 w-full min-h-[76px] select-none touch-none cursor-pointer rounded-2xl border-2 border-amber-500/70 bg-gradient-to-b from-[#4a0d0d] via-[#6b1a1a] to-[#4a0d0d] px-4 py-3 text-left transition-all active:scale-[0.99]"
        >
          <span className="block text-[10px] font-mono uppercase tracking-[0.16em] text-amber-300/90">
            {beat.phase === 'skip' ? 'Hold — one step' : 'Hold — press and keep hold'}
          </span>
          <span className="mt-1 block font-serif text-xs sm:text-sm text-amber-100">
            {beat.holding ? 'Hold it…' : 'Press and hold'}
          </span>
          <span className="mt-2 block h-2 w-full overflow-hidden rounded-full border border-amber-900/60 bg-neutral-950/80">
            <span
              data-oath-progress={progress.toFixed(2)}
              className="block h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </span>
        </button>

        <p className="mt-2 text-[10px] leading-snug text-neutral-400">
          A breath of a hold — finger, mouse or the space bar. Let go early and the line waits; nothing
          is lost and nothing is timed.
        </p>
      </div>
    </div>
  );
};
