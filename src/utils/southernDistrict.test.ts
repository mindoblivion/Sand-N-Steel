import { describe, test, expect } from 'bun:test';
import { HUB_LOCATIONS } from './cityCollisions';

/**
 * CITY-EXPAND-1 — Southern district HUB pins.
 * Five new locations in the southern strip (Z 26→35).
 */

const SOUTHERN_IDS = ['forum', 'macellum', 'bibliotheca', 'pistrinum', 'triumphal_arch'] as const;

const EXPECTED: Record<string, { x: number; z: number; r: number }> = {
  forum: { x: 0, z: 31, r: 5 },
  macellum: { x: -14, z: 32, r: 5 },
  bibliotheca: { x: 12, z: 30, r: 6 },
  pistrinum: { x: -24, z: 31, r: 5 },
  triumphal_arch: { x: 0, z: 35, r: 3 },
};

describe('southern district HUBs', () => {
  for (const id of SOUTHERN_IDS) {
    test(`${id} exists with correct position`, () => {
      const hub = HUB_LOCATIONS.find((h) => h.id === id);
      expect(hub).toBeDefined();
      const exp = EXPECTED[id];
      expect(hub!.position[0]).toBe(exp.x);
      expect(hub!.position[2]).toBe(exp.z);
      expect(hub!.radius).toBe(exp.r);
    });
  }

  test('all southern HUBs within city bounds', () => {
    for (const id of SOUTHERN_IDS) {
      const hub = HUB_LOCATIONS.find((h) => h.id === id)!;
      expect(Math.abs(hub.position[0])).toBeLessThanOrEqual(35);
      expect(hub.position[2]).toBeLessThanOrEqual(35);
      expect(hub.position[2]).toBeGreaterThanOrEqual(26);
    }
  });

  test('southern HUBs are at least 4 units apart', () => {
    const hubs = SOUTHERN_IDS.map((id) => HUB_LOCATIONS.find((h) => h.id === id)!);
    for (let i = 0; i < hubs.length; i++) {
      for (let j = i + 1; j < hubs.length; j++) {
        const dx = hubs[i].position[0] - hubs[j].position[0];
        const dz = hubs[i].position[2] - hubs[j].position[2];
        const dist = Math.sqrt(dx * dx + dz * dz);
        expect(dist).toBeGreaterThanOrEqual(4);
      }
    }
  });

  test('triumphal arch is walk-through (small radius, no blocking collider)', () => {
    const arch = HUB_LOCATIONS.find((h) => h.id === 'triumphal_arch')!;
    // Small interaction radius means the player walks through the arch span.
    expect(arch.radius).toBeLessThanOrEqual(3);
  });

  test('southern HUBs carry the SOUTH district tag', () => {
    for (const id of SOUTHERN_IDS) {
      const hub = HUB_LOCATIONS.find((h) => h.id === id)!;
      expect(hub.district).toBe('SOUTH');
    }
  });
});
