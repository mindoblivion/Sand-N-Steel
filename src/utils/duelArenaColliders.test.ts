/**
 * ===========================================================================
 * PHASE1-CAMGUARD — Duel arena occluder set pins. Every collider's numbers
 * match the `DuelArena.tsx` source they cite: the test reads the source
 * (the `readFileSync` pattern the repo's suites use) and asserts the loge
 * rect against the podium/canopy/trim/banner measurements and the ring
 * radius against the podium-wall cylinder — nothing restates a number that
 * could drift.
 *
 * Run with: bun test src/utils/duelArenaColliders.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  DUEL_ARENA_COLLIDERS,
  DUEL_WALL_RADIUS,
  DUEL_WALL_SEGMENT_COUNT,
} from './duelArenaColliders';
import type {
  Collider,
  RectCollider,
  SegmentCollider,
} from './collisionShapes';

const ARENA_SOURCE = readFileSync(
  new URL('../components/3d/DuelArena.tsx', import.meta.url),
  'utf8',
);

// The loge rect: the only rect in the set.
function logeRect(): RectCollider {
  const rects = DUEL_ARENA_COLLIDERS.filter(
    (c): c is RectCollider => c.type === 'rect',
  );
  expect(rects).toHaveLength(1);
  return rects[0];
}

function wallSegments(): SegmentCollider[] {
  const segs = DUEL_ARENA_COLLIDERS.filter(
    (c): c is SegmentCollider => c.type === 'segment',
  );
  expect(segs).toHaveLength(DUEL_WALL_SEGMENT_COUNT);
  return segs;
}

// ── §1 — the loge rect matches the DuelArena.tsx source ────────────────────

describe('PHASE1-CAMGUARD §1 — the loge rect', () => {
  test('the source literals the rect is read from are present', () => {
    // Group root, podium, canopy, trim, banners, columns.
    expect(ARENA_SOURCE).toContain('position={[0, 5.0, -20.2]}');
    expect(ARENA_SOURCE).toContain('boxGeometry args={[10, 3.6, 4.5]}');
    expect(ARENA_SOURCE).toContain('boxGeometry args={[10.8, 0.5, 5.2]}');
    expect(ARENA_SOURCE).toContain('boxGeometry args={[11.2, 0.3, 0.2]}');
    expect(ARENA_SOURCE).toContain('PlaneGeometry(1.2, 2.4)');
    expect(ARENA_SOURCE).toContain('cloth.translate(side * 5.5, 4.8, 0)');
    expect(ARENA_SOURCE).toContain('[-4.6, 4.6]');
  });

  test('the rect is centred on the loge group with the union footprint', () => {
    const rect = logeRect();
    expect(rect.id).toBe('duel-loge');
    // Group root z −20.2; canopy depth 5.2 → z −22.8…−17.6.
    expect(rect.cz).toBe(-20.2);
    expect(rect.hd).toBe(2.6);
    // Widest piece is the dressing banners: |x| 5.5 + 1.2 / 2 = 6.1.
    expect(rect.cx).toBe(0);
    expect(rect.hw).toBe(6.1);
  });

  test('the rect covers every loge piece', () => {
    const rect = logeRect();
    const xMin = rect.cx - rect.hw;
    const xMax = rect.cx + rect.hw;
    const zMin = rect.cz - rect.hd;
    const zMax = rect.cz + rect.hd;
    // Podium x ±5 (10 / 2), canopy x ±5.4 (10.8 / 2), trim x ±5.6 (11.2 / 2),
    // banners x ±6.1.
    expect(xMin).toBeLessThanOrEqual(-6.1);
    expect(xMax).toBeGreaterThanOrEqual(6.1);
    // Podium z −22.45…−17.95 (group −20.2, depth 4.5), canopy z −22.8…−17.6.
    expect(zMin).toBeLessThanOrEqual(-22.8);
    expect(zMax).toBeGreaterThanOrEqual(-17.6);
  });
});

// ── §2 — the wall ring ──────────────────────────────────────────────────────

describe('PHASE1-CAMGUARD §2 — the wall ring', () => {
  test('the source literal the ring radius is read from is present', () => {
    // Open cylinder r 20.2, y 0–5.0 (sand section).
    expect(ARENA_SOURCE).toContain(
      'cylinderGeometry args={[20.2, 20.2, 5.0, 36, 1, true]}',
    );
    expect(DUEL_WALL_RADIUS).toBe(20.2);
  });

  test('24 segments, full 360°, one per 15°', () => {
    const segs = wallSegments();
    expect(DUEL_WALL_SEGMENT_COUNT).toBe(24);
    for (let i = 0; i < segs.length; i += 1) {
      expect(segs[i].id).toBe(`duel-wall-${i}`);
    }
  });

  test('every segment endpoint lies on the r 20.2 circle', () => {
    for (const seg of wallSegments()) {
      for (const [x, z] of [
        [seg.x1, seg.z1],
        [seg.x2, seg.z2],
      ]) {
        expect(Math.hypot(x, z)).toBeCloseTo(DUEL_WALL_RADIUS, 9);
      }
    }
  });

  test('sagitta per segment is within the city budget (≤ 0.19)', () => {
    // Sagitta = r − sqrt(r² − (chord/2)²); the city's own budget is 0.35
    // (the CAMERA_COLLISION_MARGIN) and the brief pins ≤ 0.19.
    for (const seg of wallSegments()) {
      const chord = Math.hypot(seg.x2 - seg.x1, seg.z2 - seg.z1);
      const sagitta =
        DUEL_WALL_RADIUS -
        Math.sqrt(
          DUEL_WALL_RADIUS * DUEL_WALL_RADIUS - (chord / 2) * (chord / 2),
        );
      expect(sagitta).toBeLessThanOrEqual(0.19);
    }
  });

  test('no gap between consecutive segments, and the ring is closed', () => {
    const segs = wallSegments();
    for (let i = 0; i < segs.length; i += 1) {
      const cur = segs[i];
      const next = segs[(i + 1) % segs.length];
      const gap = Math.hypot(next.x1 - cur.x2, next.z1 - cur.z2);
      expect(gap).toBeLessThanOrEqual(1e-9);
    }
  });
});

// ── §3 — the set is exactly the loge + the ring ────────────────────────────

describe('PHASE1-CAMGUARD §3 — set membership', () => {
  test('25 colliders: 1 rect + 24 segments', () => {
    expect(DUEL_ARENA_COLLIDERS).toHaveLength(25);
    const kinds = new Map<string, number>();
    for (const c of DUEL_ARENA_COLLIDERS as Collider[]) {
      kinds.set(c.type, (kinds.get(c.type) ?? 0) + 1);
    }
    expect(kinds.get('rect')).toBe(1);
    expect(kinds.get('segment')).toBe(24);
    expect(kinds.get('circle')).toBeUndefined();
  });

  test('no brazier, tier, crowd, baltei, velarium, or gate collider', () => {
    // The exclusions are asserted so a future "completion" cannot silently
    // re-add unreachable geometry without changing the test and the reason.
    for (const c of DUEL_ARENA_COLLIDERS as Collider[]) {
      expect(c.id).not.toMatch(/brazier|tier|crowd|baltei|velarium|gate/i);
    }
  });
});
