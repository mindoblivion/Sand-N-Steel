import React, { useEffect, useRef } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import type { ChariotInput } from '../../utils/chariotMovement';
import { createRacePointerHold } from '../../utils/racePointerHold';
import { createRaceAxisHold } from '../../utils/raceAxisHold';

/**
 * RaceTouchControls.tsx — Phase C-8.70B Stage 1, Slice 2: the race's touch
 * controls.
 *
 * ── What it reuses, rather than reinventing ───────────────────────────────
 * It is the race screen's only touch scheme: one full-screen
 * `pointer-events-none` overlay at `z-20` in which each cluster is
 * `pointer-events-auto touch-none`, laid out with `justify-between items-end`
 * and safe-area padding, with the project's own amber/stone round buttons.  The
 * HOLD idiom is `onTouchStart` with `preventDefault()` plus
 * `onMouseDown`/`onMouseUp`/`onMouseLeave` — the one shape that holds a value for
 * as long as a thumb stays down, which is exactly what a throttle needs, so the
 * throttle is a large HOLD-TO-RUN button pair rather than a slider.  (UI-1 removed
 * the unused second touch-control module that carried the earlier copy of this
 * idiom; this file is now the single touch-control implementation in the tree.)
 *
 * ── The two corner clusters (the amendment's layout) ──────────────────────
 * Steering lives under one thumb and throttle/brake under the other, in the two
 * bottom corners; the screen's centre carries no control at all, and nothing here
 * reaches the HUD or the Abort button, which the scene keeps in the top corners.
 * Every control is visible, labelled and has its own `data-race-control`, so
 * there is no invisible gesture zone anywhere: a swipe or a tap on bare sand
 * drives nothing.
 *
 * ── Lefty Mode mirrors the WHOLE cluster, as one unit ─────────────────────
 * With `isLeftyMode`, the outer row reverses (steering moves to the right thumb,
 * throttle/brake to the left) AND each cluster's own row reverses — a mirror of
 * the whole unit, never a per-button swap: every button keeps its own label,
 * function and value, so nothing is mislabelled by the mirror.
 */

export interface RaceTouchControlsProps {
  /**
   * The touch path's own object.  The scene merges it with the keyboard's, so
   * both paths feed the same throttle/steer values; this component only writes.
   */
  input: ChariotInput;
  /** Lefty Mode: mirror the whole cluster (see this file's header). */
  isLeftyMode: boolean;
  /** True only in the player's first race of the session — the labels fade after it. */
  showHints: boolean;
  /** Rev is being built (the throttle is held while the gates count down). */
  revving: boolean;
}

/** One round, labelled cluster button with its optional first-race hint. */
interface RaceControlButtonProps {
  control: string;
  label: string;
  accessibleLabel: string;
  hint: string;
  showHints: boolean;
  className: string;
  children: React.ReactNode;
  apply: () => void;
  release: () => void;
  /** The throttle's rev indicator (the countdown's visible rev state). */
  rev?: boolean;
}

const RaceControlButton: React.FC<RaceControlButtonProps> = ({
  control,
  label,
  accessibleLabel,
  hint,
  showHints,
  className,
  children,
  apply,
  release,
  rev,
}) => {
  const hold = useRef(createRacePointerHold());
  const releaseRef = useRef(release);
  releaseRef.current = release;

  useEffect(() => {
    // Pointer capture is the primary path. Window listeners are a fallback for
    // WebViews that reject capture or deliver the release outside the button.
    const releasePointer = (event: PointerEvent) => {
      if (hold.current.end(event.pointerId)) releaseRef.current();
    };
    window.addEventListener('pointerup', releasePointer);
    window.addEventListener('pointercancel', releasePointer);
    return () => {
      window.removeEventListener('pointerup', releasePointer);
      window.removeEventListener('pointercancel', releasePointer);
      if (hold.current.reset()) releaseRef.current();
    };
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!hold.current.begin(event.pointerId)) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can be unavailable in embedded WebViews; cancellation
      // and global race lifecycle release remain the fallback.
    }
    apply();
  };

  const handlePointerRelease = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!hold.current.end(event.pointerId)) return;
    release();
  };

  const handleLostPointerCapture = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!hold.current.end(event.pointerId)) return;
    release();
  };

  return (
    <button
      type="button"
      data-race-control={control}
      aria-label={accessibleLabel}
      data-race-rev={rev ? 'true' : 'false'}
      title={hint}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerRelease}
      onPointerCancel={handlePointerRelease}
      onLostPointerCapture={handleLostPointerCapture}
      /* UI-1 (S-2) — the min-h/min-w floor is the guarantee; the vh sizing on top of it
         is the large-screen flourish, so a short landscape phone cannot dip under 48px. */
      className={`relative min-h-[48px] min-w-[48px] rounded-full border-2 shadow-2xl flex flex-col items-center justify-center cursor-pointer transition-transform active:scale-90 shrink-0 touch-manipulation ${className}`}
    >
      {children}
      <span className="text-[8px] sm:text-[9px] font-mono font-bold tracking-tight leading-none mt-0.5">
        {label}
      </span>
      <span
        data-race-hold={control}
        className="font-mono text-[7px] sm:text-[8px] uppercase tracking-wider leading-none mt-0.5 opacity-75"
      >
        Hold
      </span>
      <span
        data-race-hint={control}
        className={`absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap px-1.5 py-0.5 rounded-md bg-neutral-950/85 border border-amber-600/50 text-[9px] font-mono uppercase tracking-wider text-amber-200 transition-opacity duration-700 pointer-events-none ${
          showHints ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {hint}
      </span>
    </button>
  );
};


export const RaceTouchControls: React.FC<RaceTouchControlsProps> = ({
  input,
  isLeftyMode,
  showHints,
  revving,
}) => {
  const mirror = isLeftyMode ? 'flex-row-reverse' : '';
  const steeringAxis = useRef(createRaceAxisHold());
  const throttleAxis = useRef(createRaceAxisHold());

  const steerCluster = (
    <div className={`pointer-events-auto touch-none flex items-end gap-2 sm:gap-3 shrink-0 ${mirror}`}>
      <RaceControlButton
        control="steer-left"
        label="LEFT"
        accessibleLabel="Steer left (hold)"
        hint="hold to steer left"
        showHints={showHints}
        className="w-[max(3rem,min(4.5rem,13vh))] h-[max(3rem,min(4.5rem,13vh))] bg-gradient-to-br from-amber-600 to-amber-800 border-amber-300 text-amber-50"
        apply={() => { input.steer = steeringAxis.current.press('left', -1); }}
        release={() => { input.steer = steeringAxis.current.release('left'); }}
      >
        <ChevronLeft className="w-6 h-6 sm:w-8 sm:h-8" />
      </RaceControlButton>
      <RaceControlButton
        control="steer-right"
        label="RIGHT"
        accessibleLabel="Steer right (hold)"
        hint="hold to steer right"
        showHints={showHints}
        className="w-[max(3rem,min(4.5rem,13vh))] h-[max(3rem,min(4.5rem,13vh))] bg-gradient-to-br from-amber-600 to-amber-800 border-amber-300 text-amber-50"
        apply={() => { input.steer = steeringAxis.current.press('right', 1); }}
        release={() => { input.steer = steeringAxis.current.release('right'); }}
      >
        <ChevronRight className="w-6 h-6 sm:w-8 sm:h-8" />
      </RaceControlButton>
    </div>
  );

  const driveCluster = (
    <div className={`pointer-events-auto touch-none flex items-end gap-2 sm:gap-3 shrink-0 ${mirror}`}>
      <RaceControlButton
        control="throttle"
        label={revving ? 'REV' : 'THROTTLE'}
        accessibleLabel="Throttle (hold)"
        hint="hold to drive"
        showHints={showHints}
        className={`w-[min(5.5rem,16vh)] h-[min(5.5rem,16vh)] bg-gradient-to-br from-lime-600 to-emerald-800 border-lime-300 text-lime-50 ${
          revving ? 'ring-4 ring-lime-300/70 shadow-[0_0_25px_rgba(163,230,53,0.6)]' : ''
        }`}
        apply={() => { input.throttle = throttleAxis.current.press('throttle', 1); }}
        release={() => { input.throttle = throttleAxis.current.release('throttle'); }}
        rev={revving}
      >
        <ChevronUp className="w-7 h-7 sm:w-9 sm:h-9" />
      </RaceControlButton>
      <RaceControlButton
        control="brake"
        label="BRAKE"
        accessibleLabel="Brake (hold)"
        hint="hold to brake / reverse"
        showHints={showHints}
        className="w-[max(3rem,min(4.5rem,13vh))] h-[max(3rem,min(4.5rem,13vh))] bg-gradient-to-br from-red-700 to-rose-900 border-red-300 text-rose-50"
        apply={() => { input.throttle = throttleAxis.current.press('brake', -1); }}
        release={() => { input.throttle = throttleAxis.current.release('brake'); }}
      >
        <ChevronDown className="w-6 h-6 sm:w-8 sm:h-8" />
      </RaceControlButton>
    </div>
  );

  return (
    <div
      className="absolute inset-0 pointer-events-none z-20 flex items-end justify-between select-none p-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] px-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:p-6"
      data-race-controls={isLeftyMode ? 'lefty' : 'righty'}
    >
      {/* The whole cluster mirrors as ONE unit: this row swaps the two clusters,
          and each cluster's own row reverses its own buttons. */}
      <div className={`flex items-end justify-between w-full gap-3 ${mirror}`}>
        {steerCluster}
        {driveCluster}
      </div>
    </div>
  );
};
