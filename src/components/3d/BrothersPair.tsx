import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { GladiatorMesh, type ImpactState } from './GladiatorMesh';
import type { FighterState } from '../../types/game';

type Vec3 = [number, number, number];

/**
 * D-4 — how fast a brother walks to his new station, in world units per second.
 * The rear station sits ~1.5 from the fighting line and the flank ~2.9 from it,
 * so a traverse reads in roughly a quarter to half a second — inside the boss's
 * own 750 ms think time, which is what keeps it a tell rather than a wait.
 */
export const BROTHERS_TRAVERSE_SPEED = 6;

/**
 * Step `current` toward `target` by at most `step`, in place. Returns true while
 * the point is still moving (including the frame it arrives). Pure arithmetic —
 * exported so the traverse can be reasoned about without a canvas.
 */
export function stepToward(current: Vec3, target: Vec3, step: number): boolean {
  const dx = target[0] - current[0];
  const dy = target[1] - current[1];
  const dz = target[2] - current[2];
  const distance = Math.hypot(dx, dy, dz);
  if (distance <= 1e-4) {
    current[0] = target[0];
    current[1] = target[1];
    current[2] = target[2];
    return false;
  }
  if (!Number.isFinite(step) || step <= 0) return true;
  if (distance <= step) {
    current[0] = target[0];
    current[1] = target[1];
    current[2] = target[2];
    return true;
  }
  const k = step / distance;
  current[0] += dx * k;
  current[1] += dy * k;
  current[2] += dz * k;
  return true;
}

export interface BrothersPairProps {
  /** The front brother's model state (Lucius — sword & shield). */
  front: FighterState;
  /** The rear brother's model state (Gaius — twin blades). */
  rear: FighterState;
  /** Where each model should stand. A change makes the model walk there. */
  frontTarget: Vec3;
  rearTarget: Vec3;
  /** The front model is unmounted once the attendants have taken him. */
  frontVisible: boolean;
  /** The front brother's heavy is live: the mesh's own telegraph glow. */
  frontGlows: boolean;
  impactRef: React.MutableRefObject<ImpactState>;
}

/**
 * D-4 — the two men of the Cotta pair.
 *
 * ONE row, one HP pool, two models. Each model is the duel's EXISTING
 * `GladiatorMesh` (no new renderer, no new material, no new animation system):
 * the brother who holds the fighting line plays the action the duel resolved,
 * the other stands at the rear station, and either of them WALKS to a new
 * station instead of teleporting — the traverse is the Crossing's tell, and it
 * uses the mesh's own `walk` clip through the `positionRef` contract the duel
 * already keeps for its fighters. Nothing here reads or writes a rule.
 */
export const BrothersPair: React.FC<BrothersPairProps> = ({
  front,
  rear,
  frontTarget,
  rearTarget,
  frontVisible,
  frontGlows,
  impactRef,
}) => {
  const frontPos = useRef<Vec3>([...frontTarget]);
  const rearPos = useRef<Vec3>([...rearTarget]);
  const movingRef = useRef({ front: false, rear: false });
  const [moving, setMoving] = useState({ front: false, rear: false });

  useFrame((_, delta) => {
    // The same 0.1 s frame clamp the duel's own movement uses, so a backgrounded
    // tab resumes a traverse instead of snapping it across the sand.
    const step = BROTHERS_TRAVERSE_SPEED * Math.min(delta, 0.1);
    const frontMoving = stepToward(frontPos.current, frontTarget, step);
    const rearMoving = stepToward(rearPos.current, rearTarget, step);
    if (frontMoving !== movingRef.current.front || rearMoving !== movingRef.current.rear) {
      movingRef.current = { front: frontMoving, rear: rearMoving };
      setMoving(movingRef.current);
    }
  });

  return (
    <>
      {frontVisible && (
        <GladiatorMesh
          fighter={front}
          positionRef={frontPos}
          overrideAction={moving.front ? 'walk' : undefined}
          impactRef={impactRef}
          telegraphGlow={frontGlows}
        />
      )}
      <GladiatorMesh
        fighter={rear}
        positionRef={rearPos}
        overrideAction={moving.rear ? 'walk' : undefined}
        impactRef={impactRef}
      />
    </>
  );
};
