import {
  BLUEPRINT_BUILDING_ASSETS,
  BLUEPRINT_CORNER_BASTIONS,
  BLUEPRINT_GATEHOUSES,
  BLUEPRINT_WALL_SEGMENTS,
  CITADEL_RAMP_END_Z,
  CITADEL_RAMP_HALF_WIDTH,
  CITADEL_RAMP_START_Z,
  CITADEL_SUMMIT_CENTER_Z,
  CITADEL_SUMMIT_MIN_Z,
  CITADEL_SUMMIT_Y,
  CITY_LAYOUT_BLUEPRINT,
  PERIMETER_CITADEL_JOIN_X,
  PERIMETER_GATE_CLEAR_HALF,
  PERIMETER_WALL_BOUND,
  PERIMETER_WALL_THICKNESS,
  type BlueprintBuilding,
  type BlueprintBuildingId,
  type BlueprintProp,
  type BlueprintRoad,
  type BlueprintWallSegment,
  type CityLayoutBlueprint,
} from '../data/cityLayoutBlueprint';
import type { CircleCollider, Collider, RectCollider } from './collisionShapes';
import { SUMMIT_CARDINAL_RADIUS, SUMMIT_SLOPE_FOOT_SCALE, SUMMIT_SUPERELLIPSE_N } from './terrainHeight';

export const BLUEPRINT_PLAYER_RADIUS = 0.45;
export const BLUEPRINT_WORLD_LIMIT = 248;

export interface Bounds2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface RoadTransform {
  id: string;
  label: string;
  type: BlueprintRoad['type'];
  center: [number, number, number];
  length: number;
  width: number;
  yaw: number;
  axis: 'x' | 'z';
  bounds: Bounds2D;
}

export interface BuildingBounds extends Bounds2D {
  id: BlueprintBuildingId;
  name: string;
  district: string;
  widthX: number;
  depthZ: number;
  frontNormal: [number, number];
  frontPoint: [number, number];
}

export interface BlueprintLocationStatus {
  district: string;
  roadLabel: string | null;
  nearestBuilding: BlueprintBuilding;
  nearestBuildingDistance: number;
  nearestShrine: BlueprintProp | null;
  elevationY: number;
  onCitadelRamp: boolean;
  onCitadelSummit: boolean;
}

/** Convert a blueprint road segment into world transform + AABB bounds. */
export function computeRoadTransform(road: BlueprintRoad): RoadTransform {
  const [x1, z1] = road.start;
  const [x2, z2] = road.end;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.hypot(dx, dz);
  const cx = (x1 + x2) / 2;
  const cz = (z1 + z2) / 2;
  const isHorizontal = Math.abs(dx) >= Math.abs(dz);
  const yaw = Math.atan2(dx, dz);

  const bounds: Bounds2D = isHorizontal
    ? {
        minX: Math.min(x1, x2),
        maxX: Math.max(x1, x2),
        minZ: cz - road.width / 2,
        maxZ: cz + road.width / 2,
      }
    : {
        minX: cx - road.width / 2,
        maxX: cx + road.width / 2,
        minZ: Math.min(z1, z2),
        maxZ: Math.max(z1, z2),
      };

  return {
    id: road.id,
    label: road.label,
    type: road.type,
    center: [cx, 0, cz],
    length,
    width: road.width,
    yaw,
    axis: isHorizontal ? 'x' : 'z',
    bounds,
  };
}

export interface WallSegmentTransform {
  id: string;
  side: BlueprintWallSegment['side'];
  center: [number, number, number];
  length: number;
  yaw: number;
  axis: 'x' | 'z';
}

/** Compute world transform for a perimeter curtain wall segment. */
export function computeWallSegmentTransform(seg: BlueprintWallSegment): WallSegmentTransform {
  const [x1, z1] = seg.start;
  const [x2, z2] = seg.end;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.hypot(dx, dz);
  const isHorizontal = Math.abs(dx) >= Math.abs(dz);
  return {
    id: seg.id,
    side: seg.side,
    center: [(x1 + x2) / 2, 0, (z1 + z2) / 2],
    length,
    yaw: isHorizontal ? 0 : Math.PI / 2,
    axis: isHorizontal ? 'x' : 'z',
  };
}

/** Compute world-space AABB and +Z forward door vector for a blueprint building. */
export function computeBuildingBounds(bldg: BlueprintBuilding): BuildingBounds {
  const [w, d] = bldg.footprint;
  const [bx, , bz] = bldg.position;
  const c = Math.abs(Math.cos(bldg.rotationY_radians));
  const s = Math.abs(Math.sin(bldg.rotationY_radians));
  const widthX = w * c + d * s;
  const depthZ = w * s + d * c;

  const nx = Math.sin(bldg.rotationY_radians);
  const nz = Math.cos(bldg.rotationY_radians);
  const frontDist = Math.abs(nx) > Math.abs(nz) ? widthX / 2 : depthZ / 2;

  return {
    id: bldg.id,
    name: bldg.name,
    district: bldg.district,
    minX: bx - widthX / 2,
    maxX: bx + widthX / 2,
    minZ: bz - depthZ / 2,
    maxZ: bz + depthZ / 2,
    widthX,
    depthZ,
    frontNormal: [nx, nz],
    frontPoint: [bx + nx * frontDist, bz + nz * frontDist],
  };
}

export function boundsOverlap(a: Bounds2D, b: Bounds2D, eps = 1e-4): boolean {
  return (
    a.minX < b.maxX - eps &&
    a.maxX > b.minX + eps &&
    a.minZ < b.maxZ - eps &&
    a.maxZ > b.minZ + eps
  );
}

/** Verify every blueprint building ID maps to an asset normalization entry. */
export function verifyBlueprintAssetMappings(
  blueprint: CityLayoutBlueprint = CITY_LAYOUT_BLUEPRINT,
): { missingIds: string[]; mappedCount: number } {
  const missingIds: string[] = [];
  for (const bldg of blueprint.buildings) {
    if (!BLUEPRINT_BUILDING_ASSETS[bldg.id]) {
      missingIds.push(bldg.id);
    }
  }
  return {
    missingIds,
    mappedCount: blueprint.buildings.length - missingIds.length,
  };
}

/**
 * Compute smooth walkable Y elevation for any world (x, z):
 *   - Citadel Ramp corridor (|x| <= 3.8, z in [-161, -133]): smooth linear incline Y = 0 -> 8.
 *   - Citadel Summit Plateau (z in [-212, -161], |x| <= 18.5): flat Y = 8.
 *   - Motte outer slope flanks: smooth superellipse slope for continuity.
 *   - Everywhere else across the 500x500 map: flat Y = 0.
 */
export function getBlueprintTerrainY(x: number, z: number): number {
  if (Math.abs(x) <= CITADEL_RAMP_HALF_WIDTH) {
    if (z <= CITADEL_RAMP_START_Z && z >= CITADEL_RAMP_END_Z) {
      const t = (CITADEL_RAMP_START_Z - z) / (CITADEL_RAMP_START_Z - CITADEL_RAMP_END_Z);
      return t * CITADEL_SUMMIT_Y;
    }
    if (z < CITADEL_RAMP_END_Z && z >= CITADEL_SUMMIT_MIN_Z) {
      return CITADEL_SUMMIT_Y;
    }
  }

  const motteScaleXZ = 1.4;
  const summitRadius = SUMMIT_CARDINAL_RADIUS * motteScaleXZ;
  const dx = x;
  const dz = z - CITADEL_SUMMIT_CENTER_Z;
  const ax = Math.abs(dx) / summitRadius;
  const az = Math.abs(dz) / summitRadius;
  const level = Math.pow(
    Math.pow(ax, SUMMIT_SUPERELLIPSE_N) + Math.pow(az, SUMMIT_SUPERELLIPSE_N),
    1 / SUMMIT_SUPERELLIPSE_N,
  );

  if (level <= 1) return CITADEL_SUMMIT_Y;
  if (level >= SUMMIT_SLOPE_FOOT_SCALE) return 0;

  const t = (level - 1) / (SUMMIT_SLOPE_FOOT_SCALE - 1);
  return CITADEL_SUMMIT_Y * (1 - t);
}

/** Build 2D physics + camera colliders matching the blueprint layout. */
export function buildBlueprintColliders(
  blueprint: CityLayoutBlueprint = CITY_LAYOUT_BLUEPRINT,
): Collider[] {
  const colliders: Collider[] = [];

  for (const bldg of blueprint.buildings) {
    const style = BLUEPRINT_BUILDING_ASSETS[bldg.id].colliderStyle;
    const bounds = computeBuildingBounds(bldg);

    if (style === 'fountain_center') {
      // Allow walking across the 25x25 plaza while keeping the central fountain solid
      colliders.push({
        id: `${bldg.id}_basin`,
        type: 'circle',
        cx: bldg.position[0],
        cz: bldg.position[2],
        r: 3.4,
      });
    } else if (style === 'colosseum_portal') {
      // Circular outer Colosseum drum matching GrandColosseum scaled radius (~37)
      colliders.push({
        id: `${bldg.id}_drum`,
        type: 'circle',
        cx: bldg.position[0],
        cz: bldg.position[2],
        r: 37.0,
      });
    } else if (style === 'citadel_motte') {
      // Left and right moat/flank blockers leaving the central ramp corridor + summit courtyard walkable
      colliders.push(
        {
          id: 'citadel_west_flank',
          type: 'rect',
          cx: -24.5,
          cz: -180,
          hw: 20.0,
          hd: 43.0,
        },
        {
          id: 'citadel_east_flank',
          type: 'rect',
          cx: 24.5,
          cz: -180,
          hw: 20.0,
          hd: 43.0,
        },
        // Fortress keep walls on top of the Y=8 summit behind the south courtyard landing
        {
          id: 'citadel_fortress_keep',
          type: 'rect',
          cx: 0,
          cz: -186,
          hw: 12.0,
          hd: 12.0,
        },
      );
    } else if (style === 'well_courtyard') {
      const [bx, , bz] = bldg.position;
      colliders.push(
        { id: `${bldg.id}_north`, type: 'rect', cx: bx, cz: bz - 5.3, hw: 6.0, hd: 0.7 },
        { id: `${bldg.id}_west`, type: 'rect', cx: bx - 5.3, cz: bz, hw: 0.7, hd: 6.0 },
        { id: `${bldg.id}_east`, type: 'rect', cx: bx + 5.3, cz: bz, hw: 0.7, hd: 6.0 },
        { id: `${bldg.id}_front_l`, type: 'rect', cx: bx - 4.2, cz: bz + 5.3, hw: 1.8, hd: 0.7 },
        { id: `${bldg.id}_front_r`, type: 'rect', cx: bx + 4.2, cz: bz + 5.3, hw: 1.8, hd: 0.7 },
        { id: `${bldg.id}_wellhead`, type: 'circle', cx: bx, cz: bz - 0.5, r: 1.45 },
      );
    } else if (style === 'barracks_courtyard') {
      const [bx, , bz] = bldg.position;
      colliders.push(
        { id: `${bldg.id}_rear`, type: 'rect', cx: bx, cz: bz - 8.25, hw: 17.0, hd: 4.75 },
        { id: `${bldg.id}_west`, type: 'rect', cx: bx - 13.4, cz: bz + 4.75, hw: 3.6, hd: 8.25 },
        { id: `${bldg.id}_east`, type: 'rect', cx: bx + 13.4, cz: bz + 4.75, hw: 3.6, hd: 8.25 },
        { id: `${bldg.id}_gate_l`, type: 'rect', cx: bx - 7.0, cz: bz + 12.25, hw: 2.8, hd: 0.75 },
        { id: `${bldg.id}_gate_r`, type: 'rect', cx: bx + 7.0, cz: bz + 12.25, hw: 2.8, hd: 0.75 },
      );
    } else {
      colliders.push({
        id: bldg.id,
        type: 'rect',
        cx: bldg.position[0],
        cz: bldg.position[2],
        hw: Math.max(1, bounds.widthX / 2 - 0.35),
        hd: Math.max(1, bounds.depthZ / 2 - 0.35),
      });
    }
  }

  for (const lamp of blueprint.props_and_waypoints.streetlamps) {
    colliders.push({
      id: lamp.id,
      type: 'circle',
      cx: lamp.position[0],
      cz: lamp.position[2],
      r: 0.45,
    });
  }

  for (const stall of blueprint.props_and_waypoints.market_stalls) {
    colliders.push({
      id: stall.id,
      type: 'rect',
      cx: stall.position[0],
      cz: stall.position[2],
      hw: stall.footprint[0] / 2,
      hd: stall.footprint[1] / 2,
    });
  }

  for (const shrine of blueprint.props_and_waypoints.fast_travel_shrines) {
    colliders.push({
      id: shrine.id,
      type: 'rect',
      cx: shrine.position[0],
      cz: shrine.position[2],
      hw: shrine.footprint[0] / 2 - 0.15,
      hd: shrine.footprint[1] / 2 - 0.15,
    });
  }

  // Step 2: Perimeter Curtain Walls at ±200 (overlapping slightly into bastions & towers)
  const wallHalfThick = PERIMETER_WALL_THICKNESS / 2 + 0.25;
  for (const seg of BLUEPRINT_WALL_SEGMENTS) {
    const wt = computeWallSegmentTransform(seg);
    colliders.push({
      id: seg.id,
      type: 'rect',
      cx: wt.center[0],
      cz: wt.center[2],
      hw: wt.axis === 'x' ? wt.length / 2 + 0.5 : wallHalfThick,
      hd: wt.axis === 'z' ? wt.length / 2 + 0.5 : wallHalfThick,
    });
  }

  // Corner Bastions at (±200, ±200)
  for (const bastion of BLUEPRINT_CORNER_BASTIONS) {
    colliders.push({
      id: bastion.id,
      type: 'rect',
      cx: bastion.position[0],
      cz: bastion.position[2],
      hw: 5.8,
      hd: 5.8,
    });
  }

  // Citadel Flank Abutment Towers tying z = -200 north wall into NorthernMotte flanks
  for (const sign of [-1, 1] as const) {
    colliders.push({
      id: `citadel_abutment_${sign < 0 ? 'w' : 'e'}`,
      type: 'rect',
      cx: sign * PERIMETER_CITADEL_JOIN_X,
      cz: -PERIMETER_WALL_BOUND,
      hw: 4.0,
      hd: 4.0,
    });
  }

  // South, West, and East Gatehouse flanking towers + recessed iron portcullis barrier
  for (const gate of BLUEPRINT_GATEHOUSES) {
    const [gx, , gz] = gate.position;
    const isSouth = gate.id === 'gate_south';
    if (isSouth) {
      colliders.push(
        { id: `${gate.id}_tower_w`, type: 'rect', cx: gx - 9.2, cz: gz, hw: 2.9, hd: 3.8 },
        { id: `${gate.id}_tower_e`, type: 'rect', cx: gx + 9.2, cz: gz, hw: 2.9, hd: 3.8 },
        {
          id: `${gate.id}_portcullis`,
          type: 'rect',
          cx: gx,
          cz: gz + 1.4,
          hw: PERIMETER_GATE_CLEAR_HALF + 0.4,
          hd: 0.7,
        },
      );
    } else {
      const signOut = gx < 0 ? -1 : 1;
      colliders.push(
        { id: `${gate.id}_tower_n`, type: 'rect', cx: gx, cz: gz - 9.2, hw: 3.8, hd: 2.9 },
        { id: `${gate.id}_tower_s`, type: 'rect', cx: gx, cz: gz + 9.2, hw: 3.8, hd: 2.9 },
        {
          id: `${gate.id}_portcullis`,
          type: 'rect',
          cx: gx + signOut * 1.4,
          cz: gz,
          hw: 0.7,
          hd: PERIMETER_GATE_CLEAR_HALF + 0.4,
        },
      );
    }
  }

  return colliders;
}

function pushOutOfRect(x: number, z: number, r: number, rect: RectCollider): [number, number] {
  const closestX = Math.max(rect.cx - rect.hw, Math.min(x, rect.cx + rect.hw));
  const closestZ = Math.max(rect.cz - rect.hd, Math.min(z, rect.cz + rect.hd));
  const dx = x - closestX;
  const dz = z - closestZ;
  const distSq = dx * dx + dz * dz;

  if (distSq >= r * r) return [x, z];

  if (distSq > 1e-8) {
    const dist = Math.sqrt(distSq);
    const push = r - dist;
    return [x + (dx / dist) * push, z + (dz / dist) * push];
  }

  // Player center is inside the rect; push out along shortest axis
  const left = x - (rect.cx - rect.hw);
  const right = rect.cx + rect.hw - x;
  const top = z - (rect.cz - rect.hd);
  const bottom = rect.cz + rect.hd - z;
  const minSide = Math.min(left, right, top, bottom);
  if (minSide === left) return [rect.cx - rect.hw - r, z];
  if (minSide === right) return [rect.cx + rect.hw + r, z];
  if (minSide === top) return [x, rect.cz - rect.hd - r];
  return [x, rect.cz + rect.hd + r];
}

function pushOutOfCircle(x: number, z: number, r: number, circle: CircleCollider): [number, number] {
  const dx = x - circle.cx;
  const dz = z - circle.cz;
  const minDist = r + circle.r;
  const distSq = dx * dx + dz * dz;
  if (distSq >= minDist * minDist) return [x, z];

  const dist = Math.sqrt(Math.max(distSq, 1e-8));
  return [circle.cx + (dx / dist) * minDist, circle.cz + (dz / dist) * minDist];
}

/** Advance player movement with sliding collision resolution and terrain Y elevation. */
export function resolveBlueprintMovement(
  currentPos: [number, number, number],
  worldDx: number,
  worldDz: number,
  speed: number,
  delta: number,
  colliders: Collider[],
): [number, number, number] {
  let nextX = Math.max(-BLUEPRINT_WORLD_LIMIT, Math.min(BLUEPRINT_WORLD_LIMIT, currentPos[0] + worldDx * speed * delta));
  let nextZ = Math.max(-BLUEPRINT_WORLD_LIMIT, Math.min(BLUEPRINT_WORLD_LIMIT, currentPos[2] + worldDz * speed * delta));

  // Two solver passes keep corners smooth when sliding between adjacent props/walls
  for (let pass = 0; pass < 2; pass++) {
    for (const col of colliders) {
      if (col.type === 'rect') {
        [nextX, nextZ] = pushOutOfRect(nextX, nextZ, BLUEPRINT_PLAYER_RADIUS, col);
      } else if (col.type === 'circle') {
        [nextX, nextZ] = pushOutOfCircle(nextX, nextZ, BLUEPRINT_PLAYER_RADIUS, col);
      }
    }
  }

  nextX = Math.max(-BLUEPRINT_WORLD_LIMIT, Math.min(BLUEPRINT_WORLD_LIMIT, nextX));
  nextZ = Math.max(-BLUEPRINT_WORLD_LIMIT, Math.min(BLUEPRINT_WORLD_LIMIT, nextZ));
  const nextY = getBlueprintTerrainY(nextX, nextZ);
  return [nextX, nextY, nextZ];
}

/** Identify current road, nearest building, and elevation status for HUD readout. */
export function detectBlueprintLocation(
  pos: [number, number, number],
  blueprint: CityLayoutBlueprint = CITY_LAYOUT_BLUEPRINT,
): BlueprintLocationStatus {
  const [px, py, pz] = pos;
  let roadLabel: string | null = null;
  for (const road of blueprint.roads) {
    const rt = computeRoadTransform(road);
    if (
      px >= rt.bounds.minX &&
      px <= rt.bounds.maxX &&
      pz >= rt.bounds.minZ &&
      pz <= rt.bounds.maxZ
    ) {
      roadLabel = road.label;
      break;
    }
  }

  let nearestBuilding = blueprint.buildings[0];
  let nearestBuildingDistance = Number.POSITIVE_INFINITY;
  for (const bldg of blueprint.buildings) {
    const b = computeBuildingBounds(bldg);
    const cx = Math.max(b.minX, Math.min(px, b.maxX));
    const cz = Math.max(b.minZ, Math.min(pz, b.maxZ));
    const d = Math.hypot(px - cx, pz - cz);
    if (d < nearestBuildingDistance) {
      nearestBuildingDistance = d;
      nearestBuilding = bldg;
    }
  }

  let nearestShrine: BlueprintProp | null = null;
  let bestShrineDist = 8.0;
  for (const shrine of blueprint.props_and_waypoints.fast_travel_shrines) {
    const d = Math.hypot(px - shrine.position[0], pz - shrine.position[2]);
    if (d < bestShrineDist) {
      bestShrineDist = d;
      nearestShrine = shrine;
    }
  }

  const onCitadelRamp =
    Math.abs(px) <= CITADEL_RAMP_HALF_WIDTH &&
    pz <= CITADEL_RAMP_START_Z &&
    pz >= CITADEL_RAMP_END_Z;
  const onCitadelSummit =
    Math.abs(px) <= CITADEL_RAMP_HALF_WIDTH + 16 &&
    pz < CITADEL_RAMP_END_Z &&
    pz >= CITADEL_SUMMIT_MIN_Z &&
    py >= CITADEL_SUMMIT_Y - 0.4;

  const district = onCitadelRamp
    ? 'High-ground Citadel Ramp'
    : onCitadelSummit
      ? 'High-ground Citadel Summit'
      : nearestBuilding.district;

  return {
    district,
    roadLabel,
    nearestBuilding,
    nearestBuildingDistance,
    nearestShrine,
    elevationY: py,
    onCitadelRamp,
    onCitadelSummit,
  };
}
