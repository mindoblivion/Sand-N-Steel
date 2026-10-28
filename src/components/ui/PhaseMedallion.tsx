import React from 'react';
import { TIME_PHASES, TIME_PHASE_NAMES, type TimePhase } from '../../utils/timeState';
import { MEDALLION_TINTS, PHASE_MEDALLION_CLASS } from '../../utils/phaseFlavor';

/**
 * PhaseMedallion — Day/Night T3's city-HUD medallion: a sun-arc with one notch per
 * phase of the day and the disc sitting at the hour the clock is in, coloured by
 * the phase's CLASS (gold for the day's five phases — dawn is First Light, day
 * class — ember at dusk, silver at night) with the current phase's English label
 * beside it.
 *
 * Display only, as the slice requires: it opens nothing, has no tap action and owns
 * no state. It re-renders exactly when `phase` changes — there is no frame loop, no
 * timer and no per-frame work of any kind.
 *
 * The Latin phase names stay where the design puts them (the day banner, the duel
 * card and the race card); this reads `TIME_PHASE_NAMES`, which is English.
 */

/** The design's seven-notch arc, as geometry the render and the suite share. */
export const MEDALLION_NOTCHES = TIME_PHASES.length;
export const MEDALLION_VIEWBOX_WIDTH = 64;
export const MEDALLION_VIEWBOX_HEIGHT = 34;
const MEDALLION_CX = 32;
const MEDALLION_CY = 30;
const MEDALLION_R = 26;

/** The arc path the notches sit on — a half circle from the left end to the right. */
export const MEDALLION_ARC_PATH = `M ${MEDALLION_CX - MEDALLION_R} ${MEDALLION_CY} A ${MEDALLION_R} ${MEDALLION_R} 0 0 1 ${MEDALLION_CX + MEDALLION_R} ${MEDALLION_CY}`;

/**
 * The position of notch `index` (0 = dawn at the left end, 6 = night at the right).
 * Pure and total: an out-of-range or non-finite index is clamped to the ends.
 */
export function medallionNotch(index: number): { x: number; y: number } {
  const span = MEDALLION_NOTCHES - 1;
  const whole = Number.isFinite(index) ? Math.round(index) : 0;
  const i = Math.min(span, Math.max(0, whole));
  const angle = Math.PI - (i / span) * Math.PI;
  return {
    x: MEDALLION_CX + MEDALLION_R * Math.cos(angle),
    y: MEDALLION_CY - MEDALLION_R * Math.sin(angle),
  };
}

export const PhaseMedallion: React.FC<{ phase: TimePhase }> = ({ phase }) => {
  const rawIndex = TIME_PHASES.indexOf(phase);
  const phaseIndex = rawIndex < 0 ? 0 : rawIndex;
  const current = TIME_PHASES[phaseIndex];
  const tint = MEDALLION_TINTS[PHASE_MEDALLION_CLASS[current] ?? 'gold'];
  const disc = medallionNotch(phaseIndex);

  return (
    <div
      className="flex items-center gap-2 bg-neutral-950/85 border border-amber-600/50 px-2.5 py-1.5 rounded-2xl backdrop-blur-md shadow-2xl pointer-events-none"
      data-phase-medallion={current}
      data-phase-class={PHASE_MEDALLION_CLASS[current] ?? 'gold'}
      aria-hidden="true"
    >
      <svg
        width={MEDALLION_VIEWBOX_WIDTH}
        height={MEDALLION_VIEWBOX_HEIGHT}
        viewBox={`0 0 ${MEDALLION_VIEWBOX_WIDTH} ${MEDALLION_VIEWBOX_HEIGHT}`}
        className="shrink-0"
      >
        <path d={MEDALLION_ARC_PATH} fill="none" stroke="rgba(245,158,11,0.35)" strokeWidth="1" />
        {TIME_PHASES.map((id, index) => {
          const notch = medallionNotch(index);
          return (
            <circle
              key={id}
              cx={notch.x}
              cy={notch.y}
              r={index === phaseIndex ? 2.2 : 1.3}
              fill={tint.notch}
            />
          );
        })}
        <circle cx={disc.x} cy={disc.y} r="3.6" fill={tint.disc} stroke={tint.ring} strokeWidth="1" />
      </svg>
      <span className={`font-serif text-[10px] sm:text-xs font-bold uppercase tracking-wider ${tint.label}`}>
        {TIME_PHASE_NAMES[current]}
      </span>
    </div>
  );
};
