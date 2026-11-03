/**
 * City-wide navigation connectivity.
 *
 * The existing collision harness verifies that each fast-travel arrival is
 * collision-free and has at least one locally clear step toward the city
 * center. That is not a proof that every destination belongs to the same
 * connected walkable region. This test rasterizes the real collision registry
 * at 0.25 m and flood-fills from the normal gate spawn, then checks every
 * registered arrival against the reachable component.
 *
 * The grid is a conservative navigation audit, not a replacement for live
 * movement or a visual review. Four-neighbour movement avoids diagonal
 * corner-cutting through collider corners.
 *
 * Run with: bun test src/utils/cityRouteReachability.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import {
  CITY_COLLIDERS,
  PLAYER_RADIUS,
  collidesWith,
} from './collisionShapes';
import {
  BOUNDARY_X,
  BOUNDARY_Z_MAX,
  BOUNDARY_Z_MIN,
  CIRCUS_ENVELOPE_X_EAST,
  CIRCUS_ENVELOPE_Z_MAX,
  CIRCUS_ENVELOPE_Z_MIN,
  FAST_TRAVEL_ARRIVALS,
  HUB_LOCATIONS,
} from './cityCollisions';

const STEP = 0.25;
const MIN_X = -35;
const MAX_X = CIRCUS_ENVELOPE_X_EAST;
const MIN_Z = BOUNDARY_Z_MIN;
const MAX_Z = CIRCUS_ENVELOPE_Z_MAX;
const COLUMNS = Math.round((MAX_X - MIN_X) / STEP) + 1;
const ROWS = Math.round((MAX_Z - MIN_Z) / STEP) + 1;
const CELL_COUNT = COLUMNS * ROWS;
const MAX_GOAL_SNAP = STEP * Math.SQRT2 * 0.75;

function inWalkableEnvelope(x: number, z: number): boolean {
  if (x >= BOUNDARY_X) {
    return x <= CIRCUS_ENVELOPE_X_EAST &&
      z >= CIRCUS_ENVELOPE_Z_MIN &&
      z <= CIRCUS_ENVELOPE_Z_MAX;
  }

  return x >= MIN_X &&
    x <= BOUNDARY_X &&
    z >= MIN_Z &&
    z <= BOUNDARY_Z_MAX;
}

function cellIndex(ix: number, iz: number): number {
  return iz * COLUMNS + ix;
}

function worldX(ix: number): number {
  return MIN_X + ix * STEP;
}

function worldZ(iz: number): number {
  return MIN_Z + iz * STEP;
}

function buildReachableComponent(): Uint8Array {
  const walkable = new Uint8Array(CELL_COUNT);

  for (let iz = 0; iz < ROWS; iz += 1) {
    const z = worldZ(iz);
    for (let ix = 0; ix < COLUMNS; ix += 1) {
      const x = worldX(ix);
      if (
        inWalkableEnvelope(x, z) &&
        !collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS)
      ) {
        walkable[cellIndex(ix, iz)] = 1;
      }
    }
  }

  const startX = Math.round((0 - MIN_X) / STEP);
  const startZ = Math.round((16 - MIN_Z) / STEP);
  const start = cellIndex(startX, startZ);
  if (!walkable[start]) {
    throw new Error('Normal city spawn [0, 16] is not walkable on the audit grid');
  }

  const reachable = new Uint8Array(CELL_COUNT);
  const queue = new Int32Array(CELL_COUNT);
  let read = 0;
  let write = 0;
  queue[write++] = start;
  reachable[start] = 1;

  const offsets = [-1, 1, -COLUMNS, COLUMNS];
  while (read < write) {
    const current = queue[read++];
    const ix = current % COLUMNS;
    const iz = Math.floor(current / COLUMNS);

    for (const offset of offsets) {
      const next = current + offset;
      if (next < 0 || next >= CELL_COUNT || reachable[next] || !walkable[next]) continue;

      // Prevent row wrap for the horizontal neighbours.
      if (offset === -1 && ix === 0) continue;
      if (offset === 1 && ix === COLUMNS - 1) continue;
      // A neighbour at the first/last row is outside the raster.
      if (offset === -COLUMNS && iz === 0) continue;
      if (offset === COLUMNS && iz === ROWS - 1) continue;

      reachable[next] = 1;
      queue[write++] = next;
    }
  }

  return reachable;
}

describe('city-wide walkable connectivity', () => {
  test('every registered destination is connected to the normal gate spawn', () => {
    const reachable = buildReachableComponent();
    const unreachable: string[] = [];

    for (const location of HUB_LOCATIONS) {
      const arrival = FAST_TRAVEL_ARRIVALS[location.id];
      if (!arrival) {
        unreachable.push(`${location.id}: missing fast-travel arrival`);
        continue;
      }

      const [ax, az] = arrival;
      let connected = false;

      // Arrivals are not all exact multiples of the grid step. Search the
      // surrounding 3×3 cells and require a reachable center within 0.36 m.
      const centerX = Math.round((ax - MIN_X) / STEP);
      const centerZ = Math.round((az - MIN_Z) / STEP);
      for (let dz = -1; dz <= 1 && !connected; dz += 1) {
        for (let dx = -1; dx <= 1 && !connected; dx += 1) {
          const ix = centerX + dx;
          const iz = centerZ + dz;
          if (ix < 0 || ix >= COLUMNS || iz < 0 || iz >= ROWS) continue;
          const gx = worldX(ix);
          const gz = worldZ(iz);
          if (
            Math.hypot(gx - ax, gz - az) <= MAX_GOAL_SNAP &&
            reachable[cellIndex(ix, iz)] === 1
          ) {
            connected = true;
          }
        }
      }

      if (!connected) unreachable.push(`${location.id} at [${ax}, ${az}]`);
    }

    expect(unreachable).toEqual([]);
  });
});
