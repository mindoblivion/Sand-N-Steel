/**
 * AI-1 — the arena interior's canvas-texture factory, tested where it is pure.
 *
 * WHAT THIS PINS: the factory's contract only — import safety, dimensions,
 * colour-space and wrap modes, the four cached getters returning the SAME
 * instance, and the single-generator rule (one canvas factory in the module,
 * one place a canvas is made). The pixels themselves are NOT unit-tested:
 * a rake pattern, a block course and a fresco band are S24-accepted on a
 * device — this sandbox has no GPU and cannot judge them.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

import {
  ARENA_INTERIOR_COLORS,
  ARENA_RING_ALPHA_SIZE,
  ARENA_RING_INNER_RADIUS,
  ARENA_RING_OUTER_RADIUS,
  ARENA_SAND_PIT_RADIUS,
  ARENA_SAND_TEXTURE_SIZE,
  ARENA_TIER_TEXTURE_SIZE,
  ARENA_WALL_TEXTURE_HEIGHT,
  ARENA_WALL_TEXTURE_WIDTH,
  getArenaRingPaintTexture,
  getArenaSandTexture,
  getArenaTierTexture,
  getPodiumWallTexture,
} from './arenaInteriorTextures';
import { ROMAN_PALETTE } from '../components/3d/city/RomanMaterials';

const read = (path: string): string => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const code = (path: string): string =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const MODULE = read('./arenaInteriorTextures.ts');
const MODULE_CODE = code('./arenaInteriorTextures.ts');

type FakeCanvas = { width: number; height: number; getContext: (id: string) => unknown };

/** A 2D context that records nothing and refuses nothing. */
const noopContext = (): CanvasRenderingContext2D =>
  new Proxy(
    {},
    {
      get: (_target, key) => (key === 'canvas' ? undefined : () => undefined),
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;

function fakeDocument(): { doc: Document; canvases: FakeCanvas[] } {
  const canvases: FakeCanvas[] = [];
  const ctx = noopContext();
  const doc = {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`unexpected element: ${tag}`);
      const canvas: FakeCanvas = { width: 0, height: 0, getContext: () => ctx };
      canvases.push(canvas);
      return canvas;
    },
  } as unknown as Document;
  return { doc, canvases };
}

// ══════════════════════════════════════════════════════════════════════════
describe('AI-1 §A — import safety (nothing touches document above a call)', () => {
  test('the module imports with no DOM and every getter answers null', () => {
    // The mere import at the top of this file is half the proof; these are the
    // four getters asked for a canvas when there is none. They must not throw.
    expect(getArenaSandTexture({ document: null })).toBeNull();
    expect(getArenaRingPaintTexture({ document: null })).toBeNull();
    expect(getPodiumWallTexture({ document: null })).toBeNull();
    expect(getArenaTierTexture({ document: null })).toBeNull();
  });

  test('the guarded pattern is the shipped one (a typeof document check)', () => {
    expect(MODULE_CODE).toContain("typeof document === 'undefined'");
    // The guard lives inside the factory, and the module never touches a
    // property of the global (`document.` appears nowhere).
    const factoryAt = MODULE_CODE.indexOf('function paintArenaTexture');
    expect(factoryAt).toBeGreaterThan(-1);
    expect(MODULE_CODE.indexOf("typeof document === 'undefined'")).toBeGreaterThan(factoryAt);
    expect(MODULE_CODE).not.toContain('document.');
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('AI-1 §B — dimensions, colour space and one cached instance each', () => {
  const { doc, canvases } = fakeDocument();

  test('the sand is a 1024² pit-shaped map: clamped, repeat 1, sRGB', () => {
    const sand = getArenaSandTexture({ document: doc });
    expect(sand).not.toBeNull();
    expect((sand as THREE.CanvasTexture).image.width).toBe(ARENA_SAND_TEXTURE_SIZE);
    expect((sand as THREE.CanvasTexture).image.height).toBe(ARENA_SAND_TEXTURE_SIZE);
    expect(ARENA_SAND_TEXTURE_SIZE).toBe(1024);
    expect((sand as THREE.CanvasTexture).wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect((sand as THREE.CanvasTexture).wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect((sand as THREE.CanvasTexture).repeat.x).toBe(1);
    expect((sand as THREE.CanvasTexture).repeat.y).toBe(1);
    expect((sand as THREE.CanvasTexture).colorSpace).toBe(THREE.SRGBColorSpace);
  });

  test('the wall is 2048×512 and wraps once around the drum', () => {
    const wall = getPodiumWallTexture({ document: doc });
    expect(wall).not.toBeNull();
    expect((wall as THREE.CanvasTexture).image.width).toBe(ARENA_WALL_TEXTURE_WIDTH);
    expect((wall as THREE.CanvasTexture).image.height).toBe(ARENA_WALL_TEXTURE_HEIGHT);
    expect(ARENA_WALL_TEXTURE_WIDTH).toBe(2048);
    expect(ARENA_WALL_TEXTURE_HEIGHT).toBe(512);
    expect((wall as THREE.CanvasTexture).wrapS).toBe(THREE.RepeatWrapping);
    expect((wall as THREE.CanvasTexture).colorSpace).toBe(THREE.SRGBColorSpace);
  });

  test('the ring paint is a 512² alpha map for the ring’s own radii', () => {
    const ring = getArenaRingPaintTexture({ document: doc });
    expect(ring).not.toBeNull();
    expect((ring as THREE.CanvasTexture).image.width).toBe(ARENA_RING_ALPHA_SIZE);
    expect((ring as THREE.CanvasTexture).image.height).toBe(ARENA_RING_ALPHA_SIZE);
    expect(ARENA_RING_INNER_RADIUS).toBe(7.8);
    expect(ARENA_RING_OUTER_RADIUS).toBe(8.2);
  });

  test('the tiers are one 1024² texture shared by both cones', () => {
    const tiers = getArenaTierTexture({ document: doc });
    expect(tiers).not.toBeNull();
    expect((tiers as THREE.CanvasTexture).image.width).toBe(ARENA_TIER_TEXTURE_SIZE);
    expect((tiers as THREE.CanvasTexture).image.height).toBe(ARENA_TIER_TEXTURE_SIZE);
    expect((tiers as THREE.CanvasTexture).wrapS).toBe(THREE.RepeatWrapping);
  });

  test('each getter is cached: the same instance, generated once', () => {
    expect(getArenaSandTexture({ document: doc })).toBe(getArenaSandTexture({ document: doc }));
    expect(getPodiumWallTexture({ document: doc })).toBe(getPodiumWallTexture({ document: doc }));
    expect(getArenaRingPaintTexture({ document: doc })).toBe(getArenaRingPaintTexture({ document: doc }));
    expect(getArenaTierTexture({ document: doc })).toBe(getArenaTierTexture({ document: doc }));
    // Four textures, four canvases — no texture was painted twice.
    expect(canvases.length).toBe(4);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('AI-1 §C — one generator, not two', () => {
  test('the module has exactly ONE canvas factory and ONE CanvasTexture', () => {
    expect((MODULE_CODE.match(/createElement\('canvas'\)/g) ?? []).length).toBe(1);
    expect((MODULE_CODE.match(/new THREE\.CanvasTexture\(/g) ?? []).length).toBe(1);
    expect((MODULE_CODE.match(/function paintArenaTexture\(/g) ?? []).length).toBe(1);
    // Every texture goes through it: four getters, four calls.
    expect((MODULE_CODE.match(/paintArenaTexture\(/g) ?? []).length).toBe(5); // 1 definition + 4 calls
    // The colour table is the only thing the module exports besides the getters.
    expect((MODULE_CODE.match(/new THREE\.CanvasTexture\(/g) ?? []).length).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('AI-1 §D — the palette: no new hex value', () => {
  test('the brief’s own values, verbatim', () => {
    expect(ARENA_INTERIOR_COLORS.sand).toBe('#D6B878');
    expect(ARENA_INTERIOR_COLORS.rakeShadow).toBe('#B9955A');
    expect(ARENA_INTERIOR_COLORS.freshRake).toBe('#E4CC96');
    expect(ARENA_INTERIOR_COLORS.cypressGreen).toBe('#2E4630');
    expect(ARENA_INTERIOR_COLORS.goldTrim).toBe('#C9A227');
  });

  test('the named-without-hex tones are the shipped palette constants', () => {
    expect(ARENA_INTERIOR_COLORS.travertine).toBe(ROMAN_PALETTE.travertine.color);
    expect(ARENA_INTERIOR_COLORS.travertineDark).toBe(ROMAN_PALETTE.travertineDark.color);
    expect(ARENA_INTERIOR_COLORS.limestone).toBe(ROMAN_PALETTE.roadKerb.color);
    expect(ARENA_INTERIOR_COLORS.paintVeneta).toBe(ROMAN_PALETTE.glazedLapis.color);
    expect(ARENA_INTERIOR_COLORS.bronzeAged).toBe(ROMAN_PALETTE.agedBronze.color);
    expect(ARENA_INTERIOR_COLORS.damp).toBe(ROMAN_PALETTE.recessDark.color);
    // PaintRussata and Bone are the arena's own shipped tones.
    expect(ARENA_INTERIOR_COLORS.paintRussata).toBe('#991b1b');
    expect(ARENA_INTERIOR_COLORS.bone).toBe('#f5ede0');
    expect(ARENA_INTERIOR_COLORS.iron).toBe('#292524');
  });

  test('every colour is a well-formed hex and the table is exhaustive', () => {
    const values = Object.values(ARENA_INTERIOR_COLORS);
    expect(values).toHaveLength(14);
    for (const value of values) expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(ARENA_SAND_PIT_RADIUS).toBe(20);
  });
});
