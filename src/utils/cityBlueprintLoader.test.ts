// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BLUEPRINT_BUILDING_ASSETS,
  BLUEPRINT_CHECKPOINTS,
  BLUEPRINT_CORNER_BASTIONS,
  BLUEPRINT_GATEHOUSES,
  BLUEPRINT_WALL_SEGMENTS,
  CITADEL_RAMP_END_Z,
  CITADEL_RAMP_START_Z,
  CITADEL_SUMMIT_Y,
  CITY_LAYOUT_BLUEPRINT,
  PERIMETER_CITADEL_JOIN_X,
  PERIMETER_WALL_BOUND,
} from '../data/cityLayoutBlueprint';
import {
  boundsOverlap,
  buildBlueprintColliders,
  computeBuildingBounds,
  computeRoadTransform,
  computeWallSegmentTransform,
  detectBlueprintLocation,
  getBlueprintTerrainY,
  resolveBlueprintMovement,
  verifyBlueprintAssetMappings,
} from './cityBlueprintLoader';

const HERE = dirname(fileURLToPath(import.meta.url));
const readRepoFile = (relPath: string): string =>
  readFileSync(resolve(HERE, '..', relPath), 'utf8');

describe('City Blueprint 500x500 Steps 1-3 Loader', () => {
  test('maps all 24 blueprint buildings (11 core + 13 North District) with zero missing asset mappings', () => {
    expect(CITY_LAYOUT_BLUEPRINT.buildings).toHaveLength(24);
    const report = verifyBlueprintAssetMappings(CITY_LAYOUT_BLUEPRINT);
    expect(report.missingIds).toEqual([]);
    expect(report.mappedCount).toBe(24);

    for (const bldg of CITY_LAYOUT_BLUEPRINT.buildings) {
      const mapping = BLUEPRINT_BUILDING_ASSETS[bldg.id];
      expect(mapping).toBeDefined();
      expect(mapping.scale[0]).toBeGreaterThan(0);
      expect(mapping.scale[1]).toBeGreaterThan(0);
      expect(mapping.scale[2]).toBeGreaterThan(0);
    }
  });

  test('computes valid transforms for all 12 roads, extends S/W/E roads to ±200, and avoids building overlaps', () => {
    expect(CITY_LAYOUT_BLUEPRINT.roads).toHaveLength(12);
    const roadMap = new Map(CITY_LAYOUT_BLUEPRINT.roads.map((r) => [r.id, r]));
    expect(roadMap.get('road_main_south')?.end).toEqual([0, 200]);
    expect(roadMap.get('road_main_west')?.end).toEqual([-200, 0]);
    expect(roadMap.get('road_main_east')?.end).toEqual([200, 0]);
    expect(roadMap.get('road_alley_slums_south')?.width).toBe(5);
    expect(roadMap.get('road_alley_slums_north')?.width).toBe(5);
    expect(roadMap.get('road_alley_civic_east')?.width).toBe(6);
    expect(roadMap.get('road_alley_patrician_north')?.width).toBe(5);

    const roadTransforms = CITY_LAYOUT_BLUEPRINT.roads.map(computeRoadTransform);
    for (const rt of roadTransforms) {
      expect(rt.length).toBeGreaterThan(0);
      if (rt.type === 'main_artery') {
        expect(rt.width).toBe(12);
      } else {
        expect(rt.width).toBeGreaterThanOrEqual(5);
        expect(rt.width).toBeLessThanOrEqual(6);
      }
    }

    const buildingBounds = CITY_LAYOUT_BLUEPRINT.buildings.map(computeBuildingBounds);
    for (const road of roadTransforms) {
      for (const bldg of buildingBounds) {
        expect(boundsOverlap(road.bounds, bldg)).toBe(false);
      }
    }
  });

  test('enforces >= 6-unit spacing between all 24 building footprints, >= 2u road setback, clear Citadel/perimeter margins, and clean prop placement', () => {
    const bBounds = CITY_LAYOUT_BLUEPRINT.buildings.map(computeBuildingBounds);

    for (let i = 0; i < bBounds.length; i++) {
      for (let j = i + 1; j < bBounds.length; j++) {
        const a = bBounds[i];
        const b = bBounds[j];
        expect(boundsOverlap(a, b)).toBe(false);

        const gapX = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
        const gapZ = Math.max(0, a.minZ - b.maxZ, b.minZ - a.maxZ);
        const dist = Math.hypot(gapX, gapZ);
        expect(dist).toBeGreaterThanOrEqual(6.0);
      }
    }

    // Step 3 buildings keep clear of perimeter (|x| <= 185, z >= -185) and Citadel zone (x in [-52, 52], z <= -120)
    const step3Buildings = CITY_LAYOUT_BLUEPRINT.buildings.filter(
      (b) =>
        b.id.startsWith('bldg_insula_') ||
        b.id === 'bldg_well_courtyard' ||
        b.id === 'bldg_temple_fortuna' ||
        b.id === 'bldg_watch_barracks' ||
        b.id.startsWith('bldg_domus_'),
    );
    expect(step3Buildings).toHaveLength(13);
    const roadTransforms = CITY_LAYOUT_BLUEPRINT.roads.map(computeRoadTransform);

    for (const b of step3Buildings) {
      const box = computeBuildingBounds(b);
      expect(box.minX).toBeGreaterThanOrEqual(-185);
      expect(box.maxX).toBeLessThanOrEqual(185);
      expect(box.minZ).toBeGreaterThanOrEqual(-185);
      // Clear of Citadel Motte + Ramp corridor (x in [-52, 52], z <= -120)
      if (box.minZ <= -120) {
        expect(box.maxX < -52 || box.minX > 52).toBe(true);
      }
      // At least 2.0 units setback from every road edge
      for (const road of roadTransforms) {
        const gapX = Math.max(0, box.minX - road.bounds.maxX, road.bounds.minX - box.maxX);
        const gapZ = Math.max(0, box.minZ - road.bounds.maxZ, road.bounds.minZ - box.maxZ);
        expect(Math.hypot(gapX, gapZ)).toBeGreaterThanOrEqual(2.0);
      }
    }

    const allProps = [
      ...CITY_LAYOUT_BLUEPRINT.props_and_waypoints.streetlamps,
      ...CITY_LAYOUT_BLUEPRINT.props_and_waypoints.market_stalls,
      ...CITY_LAYOUT_BLUEPRINT.props_and_waypoints.fast_travel_shrines,
    ];
    expect(allProps).toHaveLength(41);

    for (const prop of allProps) {
      const [px, , pz] = prop.position;
      const [pw, pd] = prop.footprint;
      const propBox = {
        minX: px - pw / 2,
        maxX: px + pw / 2,
        minZ: pz - pd / 2,
        maxZ: pz + pd / 2,
      };
      for (const road of roadTransforms) {
        expect(boundsOverlap(propBox, road.bounds)).toBe(false);
      }
      for (const bldg of bBounds) {
        expect(boundsOverlap(propBox, bldg)).toBe(false);
      }
    }
  });

  test('Castle elevation ramp climbs smoothly from Y=0 at Z=-133 to Y=8 at Z=-161 and stays flat at Y=8 summit', () => {
    expect(getBlueprintTerrainY(0, 76)).toBe(0);
    expect(getBlueprintTerrainY(0, CITADEL_RAMP_START_Z)).toBeCloseTo(0, 6);
    const midZ = (CITADEL_RAMP_START_Z + CITADEL_RAMP_END_Z) / 2;
    expect(getBlueprintTerrainY(0, midZ)).toBeCloseTo(CITADEL_SUMMIT_Y / 2, 6);
    expect(getBlueprintTerrainY(0, CITADEL_RAMP_END_Z)).toBeCloseTo(CITADEL_SUMMIT_Y, 6);
    expect(getBlueprintTerrainY(0, -166)).toBeCloseTo(CITADEL_SUMMIT_Y, 6);
    expect(getBlueprintTerrainY(0, -172)).toBeCloseTo(CITADEL_SUMMIT_Y, 6);

    let prevY = -1;
    for (let z = CITADEL_RAMP_START_Z; z >= CITADEL_RAMP_END_Z; z -= 1) {
      const y = getBlueprintTerrainY(0, z);
      expect(y).toBeGreaterThanOrEqual(prevY - 1e-6);
      prevY = y;
    }
  });

  test('Step 2 places 3 outward-facing Gatehouses, 4 Corner Bastions, and ties North Walls directly into NorthernMotte flanks', () => {
    expect(BLUEPRINT_GATEHOUSES).toHaveLength(3);
    expect(BLUEPRINT_CORNER_BASTIONS).toHaveLength(4);
    expect(BLUEPRINT_WALL_SEGMENTS).toHaveLength(8);

    const byId = new Map(BLUEPRINT_GATEHOUSES.map((g) => [g.id, g]));
    expect(byId.get('gate_south')?.position).toEqual([0, 0, 200]);
    expect(byId.get('gate_west')?.position).toEqual([-200, 0, 0]);
    expect(byId.get('gate_east')?.position).toEqual([200, 0, 0]);

    for (const gate of BLUEPRINT_GATEHOUSES) {
      const outX = Math.sin(gate.rotationY);
      const outZ = Math.cos(gate.rotationY);
      const dot = outX * gate.position[0] + outZ * gate.position[2];
      expect(dot).toBeGreaterThan(190);
    }

    const bastionCoords = BLUEPRINT_CORNER_BASTIONS.map((b) => `${b.position[0]},${b.position[2]}`);
    expect(bastionCoords.sort()).toEqual(['-200,-200', '-200,200', '200,-200', '200,200'].sort());

    const northWalls = BLUEPRINT_WALL_SEGMENTS.filter((w) => w.side === 'north');
    expect(northWalls).toHaveLength(2);
    for (const nw of northWalls) {
      const wt = computeWallSegmentTransform(nw);
      expect(wt.center[2]).toBe(-PERIMETER_WALL_BOUND);
      expect(Math.abs(wt.center[0])).toBeGreaterThan(PERIMETER_CITADEL_JOIN_X);
    }
  });

  test('Perimeter walls, gatehouses, corner bastions, and Citadel flanks enclose the playable city strictly inside ±200', () => {
    const colliders = buildBlueprintColliders(CITY_LAYOUT_BLUEPRINT);

    let sPos: [number, number, number] = [0, 0, 180];
    for (let i = 0; i < 40; i++) {
      sPos = resolveBlueprintMovement(sPos, 0, 1, 10, 0.1, colliders);
    }
    expect(sPos[2]).toBeGreaterThan(199);
    expect(sPos[2]).toBeLessThanOrEqual(200.5);

    let wPos: [number, number, number] = [-180, 0, 0];
    for (let i = 0; i < 40; i++) {
      wPos = resolveBlueprintMovement(wPos, -1, 0, 10, 0.1, colliders);
    }
    expect(wPos[0]).toBeLessThan(-199);
    expect(wPos[0]).toBeGreaterThanOrEqual(-200.5);

    let ePos: [number, number, number] = [180, 0, 0];
    for (let i = 0; i < 40; i++) {
      ePos = resolveBlueprintMovement(ePos, 1, 0, 10, 0.1, colliders);
    }
    expect(ePos[0]).toBeGreaterThan(199);
    expect(ePos[0]).toBeLessThanOrEqual(200.5);

    const perimeterProbes: Array<{ start: [number, number, number]; dx: number; dz: number }> = [
      { start: [-100, 0, 190], dx: 0, dz: 1 },
      { start: [100, 0, 190], dx: 0, dz: 1 },
      { start: [-190, 0, -100], dx: -1, dz: 0 },
      { start: [-190, 0, 100], dx: -1, dz: 0 },
      { start: [190, 0, -100], dx: 1, dz: 0 },
      { start: [190, 0, 100], dx: 1, dz: 0 },
      { start: [-100, 0, -190], dx: 0, dz: -1 },
      { start: [100, 0, -190], dx: 0, dz: -1 },
      { start: [-36, 0, -185], dx: 0, dz: -1 },
      { start: [36, 0, -185], dx: 0, dz: -1 },
      { start: [0, CITADEL_SUMMIT_Y, -166], dx: 0, dz: -1 },
      { start: [-188, 0, -188], dx: -1, dz: -1 },
      { start: [188, 0, -188], dx: 1, dz: -1 },
      { start: [-188, 0, 188], dx: -1, dz: 1 },
      { start: [188, 0, 188], dx: 1, dz: 1 },
    ];

    for (const probe of perimeterProbes) {
      let p = probe.start;
      for (let i = 0; i < 30; i++) {
        p = resolveBlueprintMovement(p, probe.dx, probe.dz, 10, 0.1, colliders);
      }
      expect(Math.abs(p[0])).toBeLessThanOrEqual(200.5);
      expect(Math.abs(p[2])).toBeLessThanOrEqual(200.5);
    }
  });

  test('Watch Barracks Training Yard & Well Courtyard allow walk-in access while colliding on perimeter wing walls', () => {
    const colliders = buildBlueprintColliders(CITY_LAYOUT_BLUEPRINT);

    // Walk straight north off Via Fortuna (z=-60) into Watch Barracks courtyard [104, 0, -79]
    let bPos: [number, number, number] = [104, 0, -60];
    for (let i = 0; i < 16; i++) {
      bPos = resolveBlueprintMovement(bPos, 0, -1, 10, 0.1, colliders);
    }
    expect(bPos[2]).toBeLessThan(-70);
    expect(bPos[2]).toBeGreaterThan(-83);

    // Keep pushing north against rear barracks hall — stops cleanly at rear hall face (~z = -82.05)
    for (let i = 0; i < 15; i++) {
      bPos = resolveBlueprintMovement(bPos, 0, -1, 10, 0.1, colliders);
    }
    expect(bPos[2]).toBeGreaterThanOrEqual(-82.6);

    // Walk north from Subura South Alley ([-87, 0, -56]) into Communal Well Courtyard ([-87, 0, -66])
    let wPos: [number, number, number] = [-87, 0, -56];
    for (let i = 0; i < 10; i++) {
      wPos = resolveBlueprintMovement(wPos, 0, -1, 8, 0.1, colliders);
    }
    expect(wPos[2]).toBeLessThan(-61.5);
    expect(wPos[2]).toBeGreaterThanOrEqual(-65.0);
  });

  test('player walks cleanly along Central Plaza -> Colosseum Gate and Central Plaza -> Castle Y=8 Summit', () => {
    const colliders = buildBlueprintColliders(CITY_LAYOUT_BLUEPRINT);

    let pos: [number, number, number] = [0, 0, 14];
    for (let step = 0; step < 62; step++) {
      pos = resolveBlueprintMovement(pos, 0, 1, 10, 0.1, colliders);
    }
    expect(pos[2]).toBeGreaterThan(74);
    expect(pos[1]).toBe(0);
    const colStatus = detectBlueprintLocation(pos, CITY_LAYOUT_BLUEPRINT);
    expect(colStatus.roadLabel).toContain('Colosseum Artery');

    let rampPos: [number, number, number] = [0, 0, -125];
    for (let step = 0; step < 41; step++) {
      rampPos = resolveBlueprintMovement(rampPos, 0, -1, 10, 0.1, colliders);
    }
    expect(rampPos[2]).toBeLessThan(-164);
    expect(rampPos[1]).toBeCloseTo(CITADEL_SUMMIT_Y, 5);
    const summitStatus = detectBlueprintLocation(rampPos, CITY_LAYOUT_BLUEPRINT);
    expect(summitStatus.onCitadelSummit).toBe(true);

    const tavernPushed = resolveBlueprintMovement([-38, 0, 17], 0, 0, 0, 0.016, colliders);
    expect(
      Math.abs(tavernPushed[0] - -38) > 1 || Math.abs(tavernPushed[2] - 17) > 1,
    ).toBe(true);
  });

  test('all 14 Jump Spot checkpoints (including Step 3 North Districts) land cleanly outside solid colliders', () => {
    expect(BLUEPRINT_CHECKPOINTS).toHaveLength(14);
    const ids = new Set(BLUEPRINT_CHECKPOINTS.map((c) => c.id));
    expect(ids.has('temple_fortuna')).toBe(true);
    expect(ids.has('watch_barracks')).toBe(true);
    expect(ids.has('north_slums')).toBe(true);
    expect(ids.has('patrician_villas')).toBe(true);

    const colliders = buildBlueprintColliders(CITY_LAYOUT_BLUEPRINT);
    for (const cp of BLUEPRINT_CHECKPOINTS) {
      const settled = resolveBlueprintMovement(cp.position, 0, 0, 0, 0.016, colliders);
      expect(Math.hypot(settled[0] - cp.position[0], settled[2] - cp.position[2])).toBeLessThan(0.05);
      expect(settled[1]).toBeCloseTo(cp.position[1], 4);
    }
  });

  test('main.tsx mounts CityBlueprintScene only in dev via dynamic import without disturbing App or existing harnesses', () => {
    const main = readRepoFile('main.tsx');
    expect(main).toContain("get('devHarness') === 'city-blueprint'");
    expect(main).toContain("window.location.pathname === '/__dev/city-blueprint'");
    expect(main).toContain("import('./components/3d/city/CityBlueprintScene')");
    expect(main.split("import('./components/3d/city/CityBlueprintScene')")).toHaveLength(2);
    expect(/^import\s[^\n]*CityBlueprintScene/m.test(main)).toBe(false);

    const blueprintIf = main.indexOf('} else if (useCityBlueprintHarness) {');
    const appElse = main.indexOf('} else {');
    expect(blueprintIf).toBeGreaterThan(-1);
    expect(appElse).toBeGreaterThan(blueprintIf);
    expect(main.slice(appElse)).toContain('<App />');
  });
});
