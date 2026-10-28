import React from 'react';
import * as THREE from 'three';
import type { PlayerProfile } from '../../../types/game';
import type { TimePhase } from '../../../utils/timeState';
import { resolveDisplayClock } from '../../../utils/dayRollover';
import {
  SHRINE_SMOKE_HEIGHT,
  SHRINE_SMOKE_OPACITY,
  SHRINE_SMOKE_POSITION,
  SHRINE_SMOKE_RADIUS,
  WATCH_FIRE_EMISSIVE,
  WATCH_FIRE_HEIGHT,
  WATCH_FIRE_POSITION,
  WATCH_FIRE_RADIUS,
  shrineSmokeActive,
  watchFireLit,
} from '../../../utils/nightDressing';
import { CityFixtureMaterial } from './CityFixtureMaterial';

/**
 * CityNightDressing — Day/Night T3's two ADDED dressing meshes, and nothing else.
 *
 * Everything else this slice dresses (forum and arena-gate braziers, the tavern's
 * lanterns, the street lamps) rides meshes the city already draws, so it costs no
 * draw call and no geometry. These two have no mesh to ride:
 *
 *   • the fortress watch-fire — the fortress is a four-mesh GLB with no fixture in
 *     it, so the fire is ONE small flame standing on the motte by the gate, drawn
 *     only at night and lit by the shared `brazier` driver;
 *   • the shrine's smoke at dawn on Dies Fortunae — one transparent plume above
 *     the altar, drawn only in that hour on that day.
 *
 * Both are conditionally mounted, so at every other hour the city's draw-call
 * count is exactly what it was; neither casts a shadow, neither adds a light, and
 * neither touches geometry that already existed. Nothing here writes a save.
 */
export const CityNightDressing: React.FC<{ phase: TimePhase; profile: PlayerProfile }> = ({
  phase,
  profile,
}) => {
  // The calendar day — read through the day-boundary seam's display reader, so the city
  // scene itself keeps its one clock read and no surface gains a second one.
  const day = resolveDisplayClock(profile).day;

  return (
    <>
      {watchFireLit(phase) && (
        <mesh position={WATCH_FIRE_POSITION}>
          <coneGeometry args={[WATCH_FIRE_RADIUS, WATCH_FIRE_HEIGHT, 6]} />
          <CityFixtureMaterial
            fixture="brazier"
            base={WATCH_FIRE_EMISSIVE}
            color="#ff5722"
            emissive="#f97316"
          />
        </mesh>
      )}

      {shrineSmokeActive(phase, day) && (
        <mesh position={SHRINE_SMOKE_POSITION}>
          <coneGeometry args={[SHRINE_SMOKE_RADIUS, SHRINE_SMOKE_HEIGHT, 8, 1, true]} />
          <meshBasicMaterial
            color="#e7e5e4"
            transparent
            opacity={SHRINE_SMOKE_OPACITY}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </>
  );
};
