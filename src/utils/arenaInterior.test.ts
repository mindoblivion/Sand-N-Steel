/**
 * AI-1 — the duel arena's interior pass, pinned at the source.
 *
 * WHAT THIS PINS: the three textured surfaces (sand, ring paint, podium wall,
 * both cavea tiers), the gate swap (a merged bar grille in place of the solid
 * box, one merged dressing per gate), the arena's mesh/draw-call count (+2 for
 * the two dressings), the gates' exact positions and rotations, and that the
 * fighters' spawn path is untouched.
 *
 * WHAT IT DOES NOT PIN: how the textures look. Rake rings, block courses, a
 * fresco band and a gold boss are judged by eye on a device — a sandbox with no
 * GPU renders through software and cannot adjudicate them.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  buildLibitinariaDressingGeometry,
  buildPortcullisGrilleGeometry,
  buildTriumphalisDressingGeometry,
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

const count = (haystack: string, needle: string): number =>
  (haystack.match(new RegExp(needle, 'g')) ?? []).length;

// ══════════════════════════════════════════════════════════════════════════
describe('AI-1 §A — the four textured surfaces', () => {
  test('the sand circle carries the pit-shaped map, roughness unchanged', () => {
    expect(ARENA).toContain('circleGeometry args={[20, 36]}');
    expect(ARENA).toContain('map={arenaTextures.sand} roughness={0.92}');
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
  test('the arena draws 34 nodes — the shipped 32 plus exactly two dressings', () => {
    // `/<mesh/g` matches each `<mesh>` AND each `<meshStandardMaterial>`, which
    // is the count this repo already pins (16 meshes + 16 materials = 32
    // shipped). One grille per gate replaces the solid box one-for-one and each
    // gate gains exactly one dressing: +2 meshes, +2 materials.
    expect(count(ARENA, '<mesh')).toBe(34);
    expect(count(ARENA, '<meshStandardMaterial')).toBe(17);
  });

  test('each gate is a grille + its arch + ONE merged dressing', () => {
    // Three mesh elements and their three materials in the per-gate map.
    expect(count(GATE_SECTION, '<mesh')).toBe(6);
    expect(count(GATE_SECTION, '<meshStandardMaterial')).toBe(3);
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
    const dressed = code(ARENA_RAW.slice(ARENA_RAW.indexOf('function buildTriumphalisDressingGeometry')));
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
    const bare = code(ARENA_RAW.slice(ARENA_RAW.indexOf('function buildLibitinariaDressingGeometry')));
    expect(bare).toContain('ARENA_INTERIOR_COLORS.bronzeAged');
    expect(bare).not.toContain('cypressGreen');
    expect(bare).not.toContain('goldTrim');
    expect(bare).not.toContain('TorusGeometry');
    expect(bare).toContain('new THREE.BoxGeometry(0.9, 0.5, 0.06)');
  });

  test('each dressing is ONE merged mesh in ONE material', () => {
    // Two builders, one merge each, one geometry per gate.
    expect(count(ARENA, 'function buildTriumphalisDressingGeometry')).toBe(1);
    expect(count(ARENA, 'function buildLibitinariaDressingGeometry')).toBe(1);
    expect(count(ARENA, '<meshStandardMaterial vertexColors')).toBe(1);
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
  });

  test('the crowd group and its celebration are exactly as CF-3 left them', () => {
    expect(ARENA).toContain('<group ref={crowdGroupRef}>');
    expect(count(ARENA, '.position.y =')).toBe(1);
    expect(ARENA).toContain('Array.from({ length: 28 })');
    expect(ARENA).toContain('<boxGeometry args={[1.2, 1.4, 0.8]} />');
  });

  test('the fighters’ spawn path is untouched — the gates are scenery', () => {
    // The arena knows nothing about spawning, and the scene gained no prop.
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

  test('the arena exports the component and its three geometry builders', () => {
    const exported = ARENA.match(/^export /gm) ?? [];
    // The props interface, the component, and the three builders §E executes.
    expect(exported.length).toBe(5);
    expect(ARENA).toContain('export const DuelArena: React.FC<DuelArenaProps>');
    expect(ARENA).toContain('export function buildPortcullisGrilleGeometry');
    expect(ARENA).toContain('export function buildTriumphalisDressingGeometry');
    expect(ARENA).toContain('export function buildLibitinariaDressingGeometry');
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('AI-1 §E — the merged geometry, built for real', () => {
  test('the grille merges 12 boxes into one indexed geometry with no colours', () => {
    const grille = buildPortcullisGrilleGeometry();
    // 1 inset + 7 vertical bars + 4 horizontal bars, 24 vertices each.
    expect(grille.getAttribute('position').count).toBe(12 * 24);
    expect(grille.index ? grille.index.count : 0).toBe(12 * 36);
    for (const name of ['position', 'normal', 'uv']) {
      expect(grille.getAttribute(name)).toBeTruthy();
    }
    // One dark-iron material, so the grille carries no colour attribute.
    expect(grille.getAttribute('color')).toBeUndefined();
    grille.computeBoundingBox();
    const box = grille.boundingBox as THREE.Box3;
    // The outer bars are centred on the grille's edge, so the merged bounding
    // box is half a bar (0.08) wider than the 5.2 × 4.4 opening on every side.
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

    // One small plaque above the opening, inside the gate's own frame.
    const plaqueBox = bare.boundingBox as THREE.Box3;
    expect(plaqueBox.max.x - plaqueBox.min.x).toBeCloseTo(0.9, 5);
    expect(plaqueBox.max.y - plaqueBox.min.y).toBeCloseTo(0.5, 5);
    expect(plaqueBox.min.y).toBeGreaterThan(2.0);
    expect(plaqueBox.max.y).toBeLessThan(2.8);

    dressed.dispose();
    bare.dispose();
  });
});
