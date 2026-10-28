import React, { useEffect, useRef, useState } from 'react';

/**
 * DayBanner — Day/Night T2's day-boundary beat in the city.
 *
 * The rollover seam in `App` fires once when an advance crosses night -> dawn, and this is
 * what the player sees for it: a short sleep veil (the screen darkens over
 * `DAY_FADE_MS`, 600 ms), the new day's name in the fiction (`Dies Mercatus · Prima
 * Luce`), and the veil lifting again. No texture, no post-processing, no GPU work beyond
 * two opacity transitions on one element.
 *
 * `onDone` is held in a ref so a parent re-render cannot restart the timing; the veil and
 * the hold are two timers, both cleared on unmount.
 */

/** How long the veil takes to close (and to open again). */
export const DAY_FADE_MS = 600;

/** How long the day's name is held at full dark before the veil lifts. */
export const DAY_BANNER_HOLD_MS = 2400;

interface DayBannerProps {
  /** The new day's number — carried for diagnostics and the test hooks. */
  day: number;
  /** The banner's line, already built by `dayBannerText`. */
  text: string;
  /** Called once the beat is over; the caller drops its banner state. */
  onDone: () => void;
}

export const DayBanner: React.FC<DayBannerProps> = ({ day, text, onDone }) => {
  const [veiled, setVeiled] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    // Paint once closed so the opacity transition runs from 0 to 1 (the sleep).
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
      data-day-banner={day}
      className="fixed inset-0 z-[70] pointer-events-none flex items-center justify-center bg-neutral-950"
      style={{
        opacity: veiled ? 1 : 0,
        transition: `opacity ${DAY_FADE_MS}ms ease-in-out`,
      }}
    >
      <div className="text-center px-6">
        <p className="font-serif font-black text-xl sm:text-3xl uppercase tracking-[0.18em] text-amber-200 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
          {text}
        </p>
      </div>
    </div>
  );
};
