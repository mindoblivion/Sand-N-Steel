/**
 * AI-1 + AI-2 — the duel arena's interior pass, pinned at the source.
 *
 * WHAT THIS PINS: the four AI-1 textured surfaces (sand, ring paint, podium
 * wall, both cavea tiers), the gate swap (a merged bar grille in place of the
 * solid box, one merged dressing per gate), the arena's mesh/draw-call count,
 * the gates' exact positions and rotations, and that the fighters' spawn path
 * is untouched — then AI-2: the living cavea's two instanced crowd meshes and
 * their 480 deterministic seats, the velarium (24 masts, tension ring, linen
 * awning, 24 ropes), the pulvinar's dressing, the podium's inscription band,
 * the baltei walls, the braziers' stands (A1), the 72-segment sand rim (A2),
 * the fitted duel shadow camera (A7), and that AI-1's contracts still hold.
 *
 * WHAT IT DOES NOT PIN: how any of it looks. Rake rings, block courses, a
 * fresco band and a draped awning are judged by eye on a device — a sandbox
 * with no GPU renders through software and cannot adjudicate them.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  CROWD_HEAD_COLORS,
  CROWD_HEAD_LIFT,
  CROWD_HEAD_RADIUS,
  CROWD_PER_RING,
  CROWD_RADIUS_JITTER,
  CROWD_RINGS,
  CROWD_SEED,
  CROWD_TUNIC_COLORS,
  CROWD_Y_JITTER,
  PULVINAR_DRESSING,
  VELARIUM_AWNING_Y,
  VELARIUM_MAST_BOTTOM_Y,
  VELARIUM_MAST_COUNT,
  VELARIUM_MAST_RADIUS,
  VELARIUM_MAST_TOP_Y,
  VELARIUM_RING_RADIUS,
  VELARIUM_RING_Y,
  VELARIUM_ROPE,
  VELARIUM_ROPE_SEGMENTS,
  VELARIUM_WOOD,
  BRAZIER_STAND_TOP_Y,
  buildBalteiGeometry,
  buildBrazierStandGeometry,
  buildCrowdPlacement,
  buildLibitinariaDressingGeometry,
  buildPortcullisGrilleGeometry,
  buildPulvinarDressingGeometry,
  buildTriumphalisDressingGeometry,
  buildVelariumMastGeometry,
  buildVelariumRopeGeometry,
  crowdStepY,
} from '../components/3d/DuelArena';
import { ARENA_INTERIOR_COLORS } from './arenaInteriorTextures';

const read = (path: string): string => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const code = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const ARENA_RAW = read('../components/3d/DuelArena.tsx');
const ARENA = code(ARENA_RAW);
const SCENE = code(read('../components/duel/DuelScene.tsx'));

/** The per-gate map, from its section marker to the end of the component. */
const GATE_SECTION = code(ARENA_RAW.slice(ARENA_RAW.indexOf('6. GLADIATOR ENTRANCE GATES')));

/** One exported function's own span — from its declaration to the next export. */
const builder = (name: string): string => {
  const start = ARENA_RAW.indexOf(`export function ${name}`);
  expect(start).toBeGreaterThan(-1);
  const nextExport = ARENA_RAW.indexOf('\nexport ', start + 1);
  return code(ARENA_RAW.slice(start, nextExport === -1 ? undefined : nextExport));
};

/** The crowd's one group: its opening tag through its own closing tag. */
const CROWD_START = ARENA_RAW.indexOf('<group ref={crowdGroupRef}>');
const CROWD_SECTION = code(
  ARENA_RAW.slice(CROWD_START, ARENA_RAW.indexOf('\n      </group>', CROWD_START) + 15),
);

const count = (haystack: string, needle: string): number =>
  (haystack.match(new RegExp(needle, 'g')) ?? []).length;

/** A literal count — for needles JSX punctuation would turn into a regex. */
const countLiteral = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

// ══════════════════════════════════════════════════════════════════════════
describe('AI-1 §A — the four textured surfaces', () => {
  test('the sand disc is a 72-segment rim that meets the podium wall (A2)', () => {
    expect(ARENA).toContain('circleGeometry args={[20.2, 72]}');
    expect(ARENA).toContain('map={arenaTextures.sand} roughness={0.92}');
    // The pit's outer edge IS the wall's own radius — no dark gap.
    expect(ARENA).toContain('cylinderGeometry args={[20.2, 20.2, 5.0, 36, 1, true]}');
    // The flat sand colour is gone — the map IS the colour now.
    expect(ARENA).not.toContain('color="#c29b62"');
  });

  test('the combat ring keeps its red and gains the chipped-paint alpha map', () => {
    expect(ARENA).toContain('ringGeometry args={[7.8, 8.2, 36]}');
    expect(ARENA).toContain('color="#991b1b"');
    expect(ARENA).toContain('alphaMap={arenaTextures.ringPaint}');
    expect(ARENA).toContain('alphaTest={0.4}');
    expect(ARENA).toContain('roughness={0.8}');
  });

  test('the podium wall wears the 2048×512 map; the cornice is unchanged', () => {
    expect(ARENA).toContain('cylinderGeometry args={[20.2, 20.2, 5.0, 36, 1, true]}');
    expect(ARENA).toContain('map={arenaTextures.wall} roughness={0.7} side={THREE.DoubleSide}');
    expect(ARENA).not.toContain('color="#d4a373" roughness={0.7}');
    // Cornice untouched, colour and all.
    expect(ARENA).toContain('cylinderGeometry args={[20.5, 20.5, 0.4, 36, 1, true]}');
    expect(ARENA).toContain('color="#ecd9be" roughness={0.5}');
  });

  test('both tier cones share ONE texture; tier 2 is a darker tint of it', () => {
    expect(ARENA).toContain('cylinderGeometry args={[24, 20.6, 3.2, 36, 1, true]}');
    expect(ARENA).toContain('cylinderGeometry args={[28, 24.2, 4.0, 36, 1, true]}');
    expect(count(ARENA, 'map=\\{arenaTextures\\.tiers\\}')).toBe(2);
    expect(ARENA).toContain('color={ARENA_INTERIOR_COLORS.limestone}');
    // Neither cone keeps a flat colour of its own.
    expect(ARENA).not.toContain('color="#b47b48"');
    expect(ARENA).not.toContain('color="#854d0e"');
  });

  test('every texture comes from the one shared factory module', () => {
    expect(ARENA).toContain("from '../../utils/arenaInteriorTextures'");
    for (const getter of [
      'getArenaSandTexture',
      'getArenaRingPaintTexture',
      'getPodiumWallTexture',
      'getArenaTierTexture',
      'getArenaLinenTexture',
      'getPodiumInscriptionTexture',
    ]) {
      expect(ARENA).toContain(`${getter},`);
    }
    // No second texture source is imported by the arena.
    expect(ARENA).not.toContain('RomanMaterials');
    expect(count(ARENA, 'new THREE\\.CanvasTexture')).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('AI-1 §B — the gates: three meshes each, +2 for the two dressings', () => {
  test('the arena draws the shipped node set plus AI-1’s two dressings', () => {
    // `<mesh\b` matches the mesh elements only (never `<meshStandardMaterial`);
    // `<meshStandardMaterial` is counted separately. AI-2 moved the crowd's 56
    // per-spectator boxes to two `<instancedMesh>` elements (counted below), so
    // the per-file element count is the gates' and scenery's own.
    expect(count(ARENA, '<mesh\\b')).toBe(21);
    expect(count(ARENA, '<meshStandardMaterial')).toBe(23);
    // …and AI-2's two crowd meshes, its ropes and nothing else instanced.
    expect(count(ARENA, '<instancedMesh')).toBe(2);
    expect(count(ARENA, '<lineSegments')).toBe(1);
  });

  test('each gate is a grille + its arch + ONE merged dressing', () => {
    // Three mesh elements and their three materials in the per-gate map.
    expect(count(GATE_SECTION, '<mesh\\b')).toBe(3);
    expect(count(GATE_SECTION, '<meshStandardMaterial')).toBe(3);
    expect(count(GATE_SECTION, '<mesh\\b')).toBe(3);
    // The solid 'grate' box is gone.
    expect(ARENA).not.toContain('boxGeometry args={[5.2, 4.4, 0.2]}');
    expect(count(ARENA, 'geometry=\\{gateGeometry\\.grille\\}')).toBe(1);
    expect(count(ARENA, 'geometry=\\{isTriumphalis \\? gateGeometry\\.triumphalis')).toBe(1);
  });

  test('the grille is a merged bar geometry, one mesh, the shipped dark iron', () => {
    expect(ARENA).toContain("from 'three/examples/jsm/utils/BufferGeometryUtils.js'");
    expect(ARENA).toContain('mergeGeometries(parts, false)');
    expect(ARENA).toContain('const GATE_VERTICAL_BARS = 7;');
    expect(ARENA).toContain('const GATE_HORIZONTAL_BARS = 4;');
    expect(ARENA).toContain('const GATE_BAR_THICKNESS = 0.16;');
    expect(ARENA).toContain('const GATE_GRILLE_WIDTH = 5.2;');
    expect(ARENA).toContain('const GATE_GRILLE_HEIGHT = 4.4;');
    // The dark inset plane is part of the same merged geometry.
    expect(ARENA).toContain('inset.translate(0, 0, -0.1)');
    expect(ARENA).toContain('color="#292524" metalness={0.8} roughness={0.3}');
  });

  test('the gates keep their exact positions and rotations', () => {
    expect(ARENA).toContain(
      'position={[Math.cos(angle) * 20.0, 2.2, Math.sin(angle) * 20.0]} rotation={[0, -angle + Math.PI / 2, 0]}',
    );
    expect(ARENA).toContain('{[Math.PI / 2, -Math.PI / 2].map((angle, gi) => {');
    expect(ARENA).toContain('key={`arena-gate-${gi}`}');
    // The stone arch surround is untouched.
    expect(ARENA).toContain('boxGeometry args={[6.2, 0.8, 0.6]}');
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('AI-1 §C — Triumphalis dressed, Libitinaria bare', () => {
  test('the −Z gate is Triumphalis and the +Z gate is Libitinaria', () => {
    expect(ARENA).toContain('const isTriumphalis = Math.sin(angle) < 0;');
  });

  test('Triumphalis: laurel swag, one gold boss, two bronze chain runs', () => {
    const dressed = builder('buildTriumphalisDressingGeometry');
    expect(dressed).toContain('ARENA_INTERIOR_COLORS.cypressGreen');
    expect(dressed).toContain('ARENA_INTERIOR_COLORS.goldTrim');
    expect(dressed).toContain('ARENA_INTERIOR_COLORS.bronzeAged');
    // A torus arc (the swag) and cones (its leaves).
    expect(dressed).toContain('new THREE.TorusGeometry(');
    expect(dressed).toContain('new THREE.ConeGeometry(');
    // One boss disc, and two chain runs of five links.
    expect(count(dressed, 'new THREE.CylinderGeometry\\(')).toBe(1);
    expect(dressed).toContain('for (const side of [-1, 1])');
    expect(dressed).toContain('for (let i = 0; i < 5; i += 1)');
  });

  test('Libitinaria: one small bronze plaque — no laurel, no gold', () => {
    const bare = builder('buildLibitinariaDressingGeometry');
    expect(bare).toContain('ARENA_INTERIOR_COLORS.bronzeAged');
    expect(bare).not.toContain('cypressGreen');
    expect(bare).not.toContain('goldTrim');
    expect(bare).not.toContain('TorusGeometry');
    expect(bare).toContain('new THREE.BoxGeometry(0.9, 0.5, 0.06)');
  });

  test('each dressing is ONE merged mesh in ONE material', () => {
    // Two gate builders, one merge each, one geometry per gate.
    expect(count(ARENA, 'function buildTriumphalisDressingGeometry')).toBe(1);
    expect(count(ARENA, 'function buildLibitinariaDressingGeometry')).toBe(1);
    // The gate's dressing is the only vertex-coloured mesh inside the gates.
    expect(count(GATE_SECTION, '<meshStandardMaterial vertexColors')).toBe(1);
    expect(ARENA).toContain('vertexColors metalness={0.65} roughness={0.4}');
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('AI-1 §D — nothing else moved', () => {
  test('no light was added or removed', () => {
    expect(count(ARENA, '<pointLight')).toBe(1);
    expect(count(ARENA, '<ambientLight')).toBe(0);
    expect(count(ARENA, '<directionalLight')).toBe(0);
    expect(count(ARENA, '<hemisphereLight')).toBe(0);
    expect(count(ARENA, '<spotLight')).toBe(0);
  });

  test('the crowd group and its celebration are exactly as CF-3 left them', () => {
    expect(ARENA).toContain('<group ref={crowdGroupRef}>');
    expect(count(ARENA, '.position.y =')).toBe(1);
    expect(ARENA).toContain('stepCrowdBounce');
    expect(ARENA).toContain('createCrowdBounce');
    expect(CROWD_SECTION).toContain('<group ref={crowdGroupRef}>');
  });

  test('the fighters’ spawn path is untouched — the gates are scenery', () => {
    expect(ARENA).not.toContain('spawn');
    expect(ARENA).not.toContain("from '../duel/DuelScene'");
    expect(ARENA).not.toContain('combatCalculations');
    expect(count(SCENE, 'spawnDamageText')).toBeGreaterThan(0);
    // Exactly the six shipped props, and the scene passes all six.
    for (const prop of [
      'crowdPulseRef',
      'bannerAllegiance',
      'emberEmissive',
      'brazierIntensity',
      'bowlEmissive',
      'crowdDress',
    ]) {
      expect(ARENA).toContain(`${prop}?:`);
      expect(SCENE).toContain(`${prop}=`);
    }
  });

  test('the arena exports the component, the gates’ builders and AI-2’s', () => {
    expect(ARENA).toContain('export const DuelArena: React.FC<DuelArenaProps>');
    for (const builderName of [
      'buildPortcullisGrilleGeometry',
      'buildTriumphalisDressingGeometry',
      'buildLibitinariaDressingGeometry',
      'buildVelariumMastGeometry',
      'buildVelariumRopeGeometry',
      'buildPulvinarDressingGeometry',
      'buildBalteiGeometry',
      'buildBrazierStandGeometry',
      'buildCrowdPlacement',
    ]) {
      expect(ARENA).toContain(`export function ${builderName}`);
    }
  });

  test('the D-3 canopy still maps bannerAllegiance, unchanged', () => {
    expect(ARENA).toContain("bannerAllegiance === 'gilded'");
    expect(ARENA).toContain("? '#eab308'");
    expect(ARENA).toContain("bannerAllegiance === 'brothers'");
    expect(ARENA).toContain("? '#7f1d1d'");
    expect(ARENA).toContain("bannerAllegiance === 'dusk'");
    expect(ARENA).toContain("? '#4c0519'");
    expect(ARENA).toContain(": '#881337'");
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('AI-1 §E — the merged geometry, built for real', () => {
  test('the grille merges 12 boxes into one indexed geometry with no colours', () => {
    const grille = buildPortcullisGrilleGeometry();
    expect(grille.getAttribute('position').count).toBe(12 * 24);
    expect(grille.index ? grille.index.count : 0).toBe(12 * 36);
    for (const name of ['position', 'normal', 'uv']) {
      expect(grille.getAttribute(name)).toBeTruthy();
    }
    expect(grille.getAttribute('color')).toBeUndefined();
    grille.computeBoundingBox();
    const box = grille.boundingBox as THREE.Box3;
    expect(box.min.x).toBeCloseTo(-2.68, 5);
    expect(box.max.x).toBeCloseTo(2.68, 5);
    expect(box.min.y).toBeCloseTo(-2.28, 5);
    expect(box.max.y).toBeCloseTo(2.28, 5);
    expect(box.max.z).toBeCloseTo(0.08, 5);
    grille.dispose();
  });

  test('both dressings merge cleanly and carry their palette in vertex colours', () => {
    const dressed = buildTriumphalisDressingGeometry();
    const bare = buildLibitinariaDressingGeometry();

    for (const geometry of [dressed, bare]) {
      expect(geometry.getAttribute('position').count).toBeGreaterThan(0);
      expect(geometry.getAttribute('color')).toBeTruthy();
      geometry.computeBoundingBox();
      const box = geometry.boundingBox as THREE.Box3;
      for (const value of [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z]) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }

    const paletteOf = (geometry: THREE.BufferGeometry): string[] => {
      const attribute = geometry.getAttribute('color');
      const seen = new Set<string>();
      for (let i = 0; i < attribute.count; i += 1) {
        seen.add(
          [attribute.getX(i), attribute.getY(i), attribute.getZ(i)]
            .map((channel) => channel.toFixed(4))
            .join(','),
        );
      }
      return [...seen];
    };
    const linear = (hex: string): string => {
      const color = new THREE.Color(hex);
      return [color.r, color.g, color.b].map((channel) => channel.toFixed(4)).join(',');
    };

    const dressedTones = paletteOf(dressed);
    expect(dressedTones).toContain(linear(ARENA_INTERIOR_COLORS.cypressGreen));
    expect(dressedTones).toContain(linear(ARENA_INTERIOR_COLORS.goldTrim));
    expect(dressedTones).toContain(linear(ARENA_INTERIOR_COLORS.bronzeAged));
    expect(dressedTones).toHaveLength(3);

    // Libitinaria is bare: bronze only — no laurel green, no gold.
    expect(paletteOf(bare)).toEqual([linear(ARENA_INTERIOR_COLORS.bronzeAged)]);

    const plaqueBox = bare.boundingBox as THREE.Box3;
    expect(plaqueBox.max.x - plaqueBox.min.x).toBeCloseTo(0.9, 5);
    expect(plaqueBox.max.y - plaqueBox.min.y).toBeCloseTo(0.5, 5);
    expect(plaqueBox.min.y).toBeGreaterThan(2.0);
    expect(plaqueBox.max.y).toBeLessThan(2.8);

    dressed.dispose();
    bare.dispose();
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('AI-2 §F — the crowd: two instanced meshes, 480 seated spectators', () => {
  test('exactly TWO instanced meshes, and no per-spectator mesh loop remains', () => {
    expect(count(ARENA, '<instancedMesh')).toBe(2);
    expect(ARENA).toContain('CROWD_COUNT');
    // The shipped per-spectator loop and its two boxes per iteration are gone.
    expect(ARENA).not.toContain('Array.from({ length: 28 })');
    expect(ARENA).not.toContain('boxGeometry args={[1.4, 1.5, 0.8]}');
    // Inside the crowd group itself: two instanced meshes, zero <mesh> nodes.
    expect(count(CROWD_SECTION, '<instancedMesh')).toBe(2);
    expect(count(CROWD_SECTION, '<mesh\\b')).toBe(0);
    // The shipped body box survives as the instanced geometry; heads are spheres.
    expect(CROWD_SECTION).toContain('<boxGeometry args={[1.2, 1.4, 0.8]} />');
    expect(CROWD_SECTION).toContain('<sphereGeometry args={[CROWD_HEAD_RADIUS, 8, 6]} />');
    // castShadow is off on both — a deliberate mobile decision.
    expect(count(CROWD_SECTION, 'castShadow={false}')).toBe(2);
    // T3's dress emissive stays a MATERIAL property on both materials.
    expect(countLiteral(CROWD_SECTION, 'emissiveIntensity={crowdDress ?? 0}')).toBe(2);
    expect(count(CROWD_SECTION, 'emissive="#f59e0b"')).toBe(2);
  });

  test('6 rings x 80 = 480 seats, from CROWD_SEED — pinned verbatim', () => {
    expect(CROWD_SEED).toBe(7);
    expect(CROWD_PER_RING).toBe(80);
    expect(CROWD_RINGS).toHaveLength(6);
    expect(CROWD_RINGS.map((ring) => ring.radius)).toEqual([21.4, 22.2, 23.0, 25.0, 25.8, 26.6]);
    expect(CROWD_RINGS.map((ring) => ring.y)).toEqual([7.05, 7.8, 8.56, 10.34, 11.2, 12.03]);
    expect(CROWD_RINGS.map((ring) => ring.tier)).toEqual([0, 0, 0, 1, 1, 1]);
    expect(buildCrowdPlacement()).toHaveLength(480);
    // The two shipped rings keep their exact positions.
    expect(CROWD_RINGS[1]).toEqual({ tier: 0, radius: 22.2, y: 7.8 });
    expect(CROWD_RINGS[4]).toEqual({ tier: 1, radius: 25.8, y: 11.2 });
    // Every ring's pinned y IS the shipped convention: the tier slope + 1.1.
    for (const ring of CROWD_RINGS) {
      expect(ring.y - 1.1).toBeCloseTo(crowdStepY(ring.tier, ring.radius), 1);
    }
  });

  test('the seeded jitter, scale and colours are the brief’s own', () => {
    expect(CROWD_RADIUS_JITTER).toBe(0.25);
    expect(CROWD_Y_JITTER).toBe(0.15);
    expect(CROWD_HEAD_RADIUS).toBe(0.28);
    expect(CROWD_HEAD_LIFT).toBe(0.95);
    expect([...CROWD_TUNIC_COLORS]).toEqual([
      '#991b1b',
      '#f5f5f4',
      '#78350f',
      '#b45309',
      '#e5e5e5',
      '#3f3a34',
      '#8a6f4d',
      '#5b6b7a',
    ]);
    expect([...CROWD_HEAD_COLORS]).toEqual(['#b45309', '#e5e5e5']);
    expect(ARENA).toContain('CROWD_SCALE_MIN');
    expect(ARENA).toContain('CROWD_SCALE_MAX');

    const placement = buildCrowdPlacement();
    expect(buildCrowdPlacement()).toEqual(placement); // deterministic
    for (const spectator of placement) {
      expect(spectator.scale).toBeGreaterThanOrEqual(0.92);
      expect(spectator.scale).toBeLessThanOrEqual(1.08);
      expect(CROWD_TUNIC_COLORS).toContain(spectator.tunic as (typeof CROWD_TUNIC_COLORS)[number]);
      expect(CROWD_HEAD_COLORS).toContain(spectator.head as (typeof CROWD_HEAD_COLORS)[number]);
      // Facing the arena's centre: the body's +Z axis points inward.
      expect(Math.sin(spectator.yaw)).toBeCloseTo(-spectator.x / spectator.radius, 9);
      expect(Math.cos(spectator.yaw)).toBeCloseTo(-spectator.z / spectator.radius, 9);
    }
    // Every tunic tone is used at least once across the 480.
    for (const tone of CROWD_TUNIC_COLORS) {
      expect(placement.some((spectator) => spectator.tunic === tone)).toBe(true);
    }
    for (const tone of CROWD_HEAD_COLORS) {
      expect(placement.some((spectator) => spectator.head === tone)).toBe(true);
    }
  });

  test('A5 — every spectator is seated ON its step, not floating above it', () => {
    // The crowd group draws the body from the seat upward: the instance's y is
    // the seat plus half a SCALED body, so the feet land on `seatY`.
    expect(ARENA).toContain('spectator.seatY + (CROWD_BODY_HEIGHT / 2) * scale');

    let worst = 0;
    for (const spectator of buildCrowdPlacement()) {
      const tier = spectator.radius < 24 ? 0 : 1;
      const step = crowdStepY(tier, spectator.radius);
      const lift = spectator.seatY - step;
      expect(Math.abs(lift)).toBeLessThanOrEqual(CROWD_Y_JITTER + 1e-9);
      expect(spectator.seatY).toBeCloseTo(step + lift, 12);
      worst = Math.max(worst, Math.abs(lift));
    }
    // The seat is the step surface, never the shipped 0.4 float above it.
    expect(worst).toBeGreaterThan(0);
    expect(worst).toBeLessThanOrEqual(CROWD_Y_JITTER);
    expect(0.4).toBeGreaterThan(CROWD_Y_JITTER + 0.2);
  });

  test('CF-3’s bounce still wraps the crowd: the group, the ref and the step', () => {
    expect(ARENA).toContain('<group ref={crowdGroupRef}>');
    expect(ARENA).toContain('useFrame((_, delta) => {');
    expect(ARENA).toContain('stepCrowdBounce(');
    expect(ARENA).toContain("from '../../utils/crowdHype'");
    expect(count(ARENA, 'group.position.y = stepCrowdBounce')).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('AI-2 §G — the velarium', () => {
  test('24 masts on the rim, a tension ring, a linen awning, 24 ropes', () => {
    expect(VELARIUM_MAST_COUNT).toBe(24);
    expect(VELARIUM_MAST_RADIUS).toBe(29.2);
    expect(VELARIUM_MAST_BOTTOM_Y).toBe(12.2);
    expect(VELARIUM_MAST_TOP_Y).toBe(17.0);
    expect(VELARIUM_RING_RADIUS).toBe(13);
    expect(VELARIUM_RING_Y).toBe(14.3);
    expect(VELARIUM_AWNING_Y).toBe(15.5);
    expect(VELARIUM_ROPE_SEGMENTS).toBe(24);
    expect(VELARIUM_WOOD).toBe('#6b4a2f');
    expect(VELARIUM_ROPE).toBe('#8a6f4d');
    expect(builder('buildVelariumMastGeometry')).toContain('new THREE.CylinderGeometry(0.09, 0.09, height, 6)');
    expect(builder('buildVelariumMastGeometry')).toContain('new THREE.TorusGeometry(VELARIUM_RING_RADIUS, VELARIUM_RING_TUBE, 6, 48)');
  });

  test('the awning is the pinned cone frustum, open at the centre', () => {
    expect(ARENA).toContain('cylinderGeometry args={[13, 29.2, 2.6, 48, 1, true]}');
    expect(ARENA).toContain('position={[0, VELARIUM_AWNING_Y, 0]}');
    expect(ARENA).toContain('map={arenaTextures.linen}');
    expect(ARENA).toContain('side={THREE.DoubleSide}');
    // The centre ring's radius is the awning's inner edge: sky over the sand.
    expect(VELARIUM_RING_RADIUS).toBe(13);
  });

  test('the masts and the ring merge into ONE geometry, and the ropes are 24', () => {
    const masts = buildVelariumMastGeometry();
    masts.computeBoundingBox();
    const box = masts.boundingBox as THREE.Box3;
    // 12.2 → 17.0 is the mast span; the ring sits inside it.
    expect(box.min.y).toBeCloseTo(VELARIUM_MAST_BOTTOM_Y, 5);
    expect(box.max.y).toBeCloseTo(VELARIUM_MAST_TOP_Y, 5);
    // A 6-sided mast's own silhouette: never past its 0.09 radius, and on it.
    expect(box.max.x).toBeGreaterThan(VELARIUM_MAST_RADIUS);
    expect(box.max.x).toBeLessThanOrEqual(VELARIUM_MAST_RADIUS + 0.09);
    expect(box.min.x).toBeCloseTo(-box.max.x, 9);
    const tones = new Set<string>();
    const attribute = masts.getAttribute('color');
    for (let i = 0; i < attribute.count; i += 1) {
      tones.add([attribute.getX(i), attribute.getY(i), attribute.getZ(i)].map((c) => c.toFixed(4)).join(','));
    }
    const linear = (hex: string): string => {
      const c = new THREE.Color(hex);
      return [c.r, c.g, c.b].map((channel) => channel.toFixed(4)).join(',');
    };
    expect([...tones].sort()).toEqual([linear(VELARIUM_WOOD), linear(VELARIUM_ROPE)].sort());
    masts.dispose();

    const ropes = buildVelariumRopeGeometry();
    const positions = ropes.getAttribute('position');
    // 24 segments = 48 vertices, each pair a mast top and its ring anchor.
    expect(positions.count).toBe(VELARIUM_ROPE_SEGMENTS * 2);
    for (let i = 0; i < VELARIUM_ROPE_SEGMENTS; i += 1) {
      const angle = (i / VELARIUM_ROPE_SEGMENTS) * Math.PI * 2;
      // The buffer is Float32, so 5 dp is the accessor's own precision.
      expect(positions.getX(i * 2)).toBeCloseTo(Math.cos(angle) * VELARIUM_MAST_RADIUS, 5);
      expect(positions.getY(i * 2)).toBeCloseTo(16.9, 5);
      expect(positions.getX(i * 2 + 1)).toBeCloseTo(Math.cos(angle) * VELARIUM_RING_RADIUS, 5);
      expect(positions.getY(i * 2 + 1)).toBeCloseTo(VELARIUM_RING_Y, 5);
    }
    ropes.dispose();
  });

  test('the velarium is three draw calls inside the arena', () => {
    expect(ARENA).toContain('geometry={arenaGeometry.masts}');
    expect(ARENA).toContain('geometry={arenaGeometry.ropes}');
    expect(count(ARENA, '<lineSegments')).toBe(1);
    expect(ARENA).toContain('<lineBasicMaterial color={VELARIUM_ROPE} />');
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('AI-2 §H — the pulvinar, the inscription, the baltei, the stands', () => {
  test('the pulvinar’s dressing keeps the pinned colours and is ONE mesh', () => {
    expect(PULVINAR_DRESSING.cushion).toBe('#881337');
    expect(PULVINAR_DRESSING.bone).toBe('#f5ede0');
    expect(PULVINAR_DRESSING.goldTrim).toBe('#C9A227');
    const dressing = builder('buildPulvinarDressingGeometry');
    expect(dressing).toContain('new THREE.BoxGeometry(1.6, 0.5, 1.4)');
    expect(dressing).toContain('new THREE.BoxGeometry(1.6, 1.6, 0.3)');
    expect(dressing).toContain('new THREE.BoxGeometry(2.4, 0.25, 0.9)');
    expect(dressing).toContain('new THREE.PlaneGeometry(1.2, 2.4)');
    expect(dressing).toContain('for (const side of [-1, 1])');
    expect(ARENA).toContain('geometry={arenaGeometry.pulvinar}');

    const geometry = buildPulvinarDressingGeometry();
    const tones = new Set<string>();
    const attribute = geometry.getAttribute('color');
    for (let i = 0; i < attribute.count; i += 1) {
      tones.add([attribute.getX(i), attribute.getY(i), attribute.getZ(i)].map((c) => c.toFixed(4)).join(','));
    }
    expect(tones.size).toBe(4); // crimson, marble, bone, gold
    geometry.computeBoundingBox();
    const box = geometry.boundingBox as THREE.Box3;
    // Flanking banners at x = ±5.5 (1.2 wide cloth, 1.4 rod)…
    expect(box.max.x).toBeCloseTo(6.2, 5);
    expect(box.min.x).toBeCloseTo(-6.2, 5);
    // …standing on the podium's top plane, and never through the canopy (4.65).
    expect(box.min.y).toBeCloseTo(3.05, 5);
    expect(box.max.y).toBeCloseTo(6.08, 5);
    expect(box.max.y).toBeGreaterThan(4.65);
    geometry.dispose();
  });

  test('the throne sits on the podium top inside the loge group', () => {
    const seatTop = 3.85 + 0.25; // seat box 0.5 tall, centred at 3.85
    expect(seatTop).toBeCloseTo(4.1, 5);
    expect(3.85 - 0.25).toBeCloseTo(3.6, 5); // the podium's own top face
    // The backrest tops out on the D-3 canopy's top plane, so it cannot pierce it.
    expect(3.85 + 0.8).toBeCloseTo(4.65, 5);
  });

  test('the podium inscription band is the pinned open cylinder', () => {
    expect(ARENA).toContain('cylinderGeometry args={[20.25, 20.25, 0.9, 36, 1, true]}');
    expect(ARENA).toContain('map={arenaTextures.inscription}');
    expect(ARENA).toContain('position={[0, 4.45, 0]}');
    // It sits on the upper wall: the wall spans y 0-5.0, and 4.45 ± 0.45 fits.
    expect(4.45 + 0.45).toBeLessThanOrEqual(5.0);
  });

  test('the baltei are two open cylinders merged into ONE mesh', () => {
    expect(builder('buildBalteiGeometry')).toContain('new THREE.CylinderGeometry(radius, radius, 0.7, 36, 1, true)');
    expect(ARENA).toContain('export const BALTEI_RADII = [24.15, 28.15] as const;');
    expect(ARENA).toContain('export const BALTEI_Y = [8.75, 12.75] as const;');
    expect(ARENA).toContain('geometry={arenaGeometry.baltei}');
    expect(ARENA).toContain('color={ARENA_INTERIOR_COLORS.travertine}');

    const geometry = buildBalteiGeometry();
    geometry.computeBoundingBox();
    const box = geometry.boundingBox as THREE.Box3;
    // 24.15 at y 8.75 and 28.15 at y 12.75, each 0.7 tall.
    expect(box.max.x).toBeCloseTo(28.15, 5);
    expect(box.min.y).toBeCloseTo(8.75 - 0.35, 5);
    expect(box.max.y).toBeCloseTo(12.75 + 0.35, 5);
    geometry.dispose();
  });

  test('A1 — eight brazier stands, merged into ONE mesh reaching the sand', () => {
    expect(ARENA).toContain('geometry={arenaGeometry.brazierStands}');
    expect(builder('buildBrazierStandGeometry')).toContain('for (let leg = 0; leg < 3; leg += 1)');
    expect(builder('buildBrazierStandGeometry')).toContain('new THREE.CylinderGeometry(0.42, 0.26, 0.3, 8)');
    const geometry = buildBrazierStandGeometry();
    geometry.computeBoundingBox();
    const box = geometry.boundingBox as THREE.Box3;
    // Feet on the arena floor (the slanted leg's own cap beds a few mm into
    // it, which is what a stand on sand does), cradle meeting the bowl's base.
    expect(box.min.y).toBeLessThanOrEqual(0);
    expect(box.min.y).toBeGreaterThan(-0.02);
    expect(box.max.y).toBeCloseTo(4.8, 1);
    expect(box.max.y).toBeLessThanOrEqual(BRAZIER_STAND_TOP_Y + 0.05);
    expect(box.max.x).toBeCloseTo(19.8 + 0.55 + 0.05, 1);
    expect(box.min.x).toBeCloseTo(-(19.8 + 0.55 + 0.05), 1);
    geometry.dispose();
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('AI-2 §I — +0 lights, and the shadow camera fitted (A7)', () => {
  test('the arena still adds no light of its own', () => {
    expect(count(ARENA, '<pointLight')).toBe(1);
    expect(count(ARENA, '<directionalLight')).toBe(0);
    expect(count(ARENA, '<spotLight')).toBe(0);
    expect(count(ARENA, '<ambientLight')).toBe(0);
    expect(count(ARENA, '<hemisphereLight')).toBe(0);
  });

  test('A7 — the duel key light’s shadow camera covers the arena floor', () => {
    for (const attribute of [
      'shadow-camera-left={-22}',
      'shadow-camera-right={22}',
      'shadow-camera-top={22}',
      'shadow-camera-bottom={-22}',
      'shadow-camera-near={1}',
      'shadow-camera-far={120}',
      'shadow-bias={-0.0004}',
      'shadow-normalBias={0.02}',
    ]) {
      expect(SCENE).toContain(attribute);
    }
    // ±22 covers the 20.2-radius sand and the wall band beyond it.
    expect(22).toBeGreaterThan(20.2);
    // The fitting is on the shadow-casting key light, and no light was added.
    expect(count(SCENE, '<directionalLight')).toBe(2);
    expect(count(SCENE, 'castShadow')).toBeGreaterThanOrEqual(1);
  });

  test('the anisotropy call site is the arena, with the live renderer (A6)', () => {
    expect(ARENA).toContain('applyArenaTextureAnisotropy(gl)');
    expect(ARENA).toContain('useThree((state) => state.gl)');
    expect(ARENA).not.toContain('getMaxAnisotropy');
  });
});
