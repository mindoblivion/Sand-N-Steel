import React, { useEffect, useRef, useState } from 'react';
import { DAY_BANNER_HOLD_MS, DAY_FADE_MS } from './DayBanner';

/**
 * SessionGreetingBanner — FIRST SIXTY SECONDS' opening beat (§5, retention
 * build-order step 4: CORE ONLY).
 *
 * It is the SAME pattern as Day/Night T2's `DayBanner`, deliberately: a veil that
 * fades in over `DAY_FADE_MS`, holds the line for `DAY_BANNER_HOLD_MS`, fades back
 * out, and calls `onDone` once (the caller drops its state and the city is simply
 * there). Nothing new is invented: no asset, no texture, no per-frame work — two
 * opacity transitions on one element, and the same two constants, so the city has
 * one rhythm for its day-beats.
 *
 * It is NON-MODAL and it is not a gate: it covers no control (`pointer-events-none`
 * throughout), it locks no movement, it reads no profile and it writes nothing. Its
 * only job is beat ORDER — the morning Acta card is already mounted behind it (the
 * city's own show rule is untouched), so the greeting is read first and the card is
 * revealed as the veil lifts. There is no timer in this slice beyond this fade.
 *
 * First Sixty Seconds — Director ruling R-TIMING: §5's figures are beat order, not
 * seconds, and R-GREET: the text is the shipped day's name and its own character
 * line, already built by `greetingFor` — this component prints what it is handed.
 */

interface SessionGreetingBannerProps {
  /** The exertion day the greeting is for — carried for the test hooks. */
  day: number;
  /** The line, already built by `greetingFor`. */
  text: string;
  /** Called once the beat is over; the caller drops its greeting state. */
  onDone: () => void;
}

export const SessionGreetingBanner: React.FC<SessionGreetingBannerProps> = ({
  day,
  text,
  onDone,
}) => {
  const [veiled, setVeiled] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    // Paint once at zero, then closed, so the opacity transition runs 0 → 1.
    const raf = requestAnimationFrame(() => setVeiled(true));
    const lift = setTimeout(() => setVeiled(false), DAY_FADE_MS + DAY_BANNER_HOLD_MS);
    const done = setTimeout(
      () => onDoneRef.current(),
      DAY_FADE_MS * 2 + DAY_BANNER_HOLD_MS,
    );
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(lift);
      clearTimeout(done);
    };
  }, []);

  return (
    <div
      aria-live="polite"
      data-first-sixty-greeting={day}
      className="fixed inset-0 z-[68] pointer-events-none flex items-center justify-center bg-neutral-950"
      style={{
        opacity: veiled ? 1 : 0,
        transition: `opacity ${DAY_FADE_MS}ms ease-in-out`,
      }}
    >
      <div className="text-center px-6">
        <p className="font-serif italic text-base sm:text-2xl leading-snug text-amber-100 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
          {text}
        </p>
      </div>
    </div>
  );
};
