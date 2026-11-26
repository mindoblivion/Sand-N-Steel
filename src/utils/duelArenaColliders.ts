/**
 * ===========================================================================
 * PHASE1-CAMGUARD — Duel arena occluder set. The authored colliders the
 * duel camera resolves against, in the shipped `collisionShapes.ts`
 * vocabulary, read from `src/components/3d/DuelArena.tsx` measurements.
 *
 * The duel arena is its own Canvas at the origin — the city's colosseum
 * entries describe the EXTERIOR GrandColosseum around root [0, −25], a
 * different space — so the duel set lives here, not in `CITY_COLLIDERS`.
 *
 * Contents (each entry cites the DuelArena.tsx source it was measured from):
 * - `duel-loge` (rect): the imperial loge union — podium, canopy, gold
 *   trim, and dressing banners share one footprint (x ±6.1, z −22.8…−17.6),
 *   so one rect is the correct model for the 2D resolver. The canopy is
 *   the only reachable solid; the rest rides along for free.
 * - `duel-wall-0…23` (24 segments): the podium-wall ring at r 20.2, full
 *   360°, one segment per 15°. Inert at today's bounds (max camera radius
 *   19.53 vs the ring's effective 19.68) — it is the boundary, there so a
 *   future drag-range or fighter-bounds change cannot put the camera
 *   through the wall silently.
 *
 * Excluded, with the reason recorded here so nobody re-adds them as
 * "missing" (all unreachable — see the §1 table in the brief):
 * - Gates (grilles at r 20.0): subsumed by the wall ring — the ring is the
 *   outer bound, and a ray reaching a gate crosses the ring first.
 * - Braziers (r 19.8, bowls y 4.8–5.65): the camera only reaches that
 *   radius in isometric, where height ≥ 7.2, above the bowls.
 * - Tier cones (r 20.6–24 and 24.2–28), crowd rings (r 21.4–26.6), baltei
 *   (r 24.15/28.15): outside the 19.53 camera envelope.
 * - Velarium (masts r 29.2, awning y 14.2–16.8): camera height ≤ 12.5,
 *   margin 1.7.
 *
 * Pure data: no THREE import, no React, no settings.
 * ===========================================================================
 */

import type { Collider, SegmentCollider } from './collisionShapes';

/** The podium wall's own radius (DuelArena.tsx: sand section, open cylinder). */
export const DUEL_WALL_RADIUS = 20.2;
/** Segments in the wall ring — one per 15°, full 360°. */
export const DUEL_WALL_SEGMENT_COUNT = 24;

// ── The imperial loge (pulvinar) ────────────────────────────────────────────
// Group at [0, 5.0, −20.2] (DuelArena.tsx §5):
// - Podium box [10, 3.6, 4.5] at local y 1.8 → world x ±5, y 5.0–8.6,
//   z −22.45…−17.95.
// - Canopy box [10.8, 0.5, 5.2] at local y 4.4 → world x ±5.4, y 9.15–9.65,
//   z −22.8…−17.6. THE reachable solid: isometric, far −Z end, near-default
//   pitch, the camera sits inside this box.
// - Gold trim [11.2, 0.3, 0.2] at local [0, 4.8, 2.5] → world x ±5.6,
//   y 9.65–9.95, z −17.8…−17.6.
// - Dressing banners: cloth PlaneGeometry(1.2, 2.4) at local x ±5.5 → world
//   x to ±6.1, y 8.6–11.0 (buildPulvinarDressingGeometry).
// Union footprint: x ±6.1, z −22.8…−17.6 → cx 0, cz −20.2, hw 6.1, hd 2.6.
const DUEL_LOGE: Collider = {
  type: 'rect',
  id: 'duel-loge',
  cx: 0,
  cz: -20.2,
  hw: 6.1,
  hd: 2.6,
};

// ── The podium-wall ring ────────────────────────────────────────────────────
// Open cylinder r 20.2, y 0–5.0 (DuelArena.tsx: sand section). A small local
// arc builder — the city's `arcSegments` is module-private, so the duel
// builds its own ring here rather than touching the city registry file.
// Sagitta per segment: 20.2 × (1 − cos 7.5°) ≈ 0.17 < 0.35 margin, the
// city's own budget — no squeeze-through between segments.
function duelWallRing(): SegmentCollider[] {
  const out: SegmentCollider[] = [];
  const step = (Math.PI * 2) / DUEL_WALL_SEGMENT_COUNT;
  for (let i = 0; i < DUEL_WALL_SEGMENT_COUNT; i += 1) {
    const t1 = i * step;
    const t2 = (i + 1) * step;
    out.push({
      type: 'segment',
      id: `duel-wall-${i}`,
      x1: DUEL_WALL_RADIUS * Math.cos(t1),
      z1: DUEL_WALL_RADIUS * Math.sin(t1),
      x2: DUEL_WALL_RADIUS * Math.cos(t2),
      z2: DUEL_WALL_RADIUS * Math.sin(t2),
    });
  }
  return out;
}

/**
 * PHASE1-CAMGUARD — the duel arena's occluder set: the loge rect plus the
 * 24-segment wall ring (25 colliders). The duel camera resolves against
 * this set with the shipped `resolveCameraCollision` — the set is the only
 * new data; the resolver is unchanged.
 */
export const DUEL_ARENA_COLLIDERS: Collider[] = [DUEL_LOGE, ...duelWallRing()];
