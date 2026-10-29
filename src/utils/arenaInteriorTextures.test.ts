/**
 * AI-1 — the arena interior's canvas-texture factory, tested where it is pure.
 *
 * WHAT THIS PINS: the factory's contract only — import safety, dimensions,
 * colour-space and wrap modes, the SIX cached getters (AI-1's four, plus
 * AI-2's linen and inscription) returning the SAME instance, the A6 anisotropy
 * application, the A3/A4 repaint proportions, and the single-generator rule
 * (one canvas factory in the module, one place a canvas is made). The pixels themselves are NOT unit-tested:
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
  ARENA_INSCRIPTION_TEXTURE_HEIGHT,
  ARENA_INSCRIPTION_TEXTURE_WIDTH,
  ARENA_LINEN_STRIPE_PITCH,
  ARENA_LINEN_TEXTURE_HEIGHT,
  ARENA_LINEN_TEXTURE_WIDTH,
  ARENA_RING_ALPHA_SIZE,
  ARENA_RING_INNER_RADIUS,
  ARENA_RING_OUTER_RADIUS,
  ARENA_SAND_PIT_RADIUS,
  ARENA_SAND_TEXTURE_SIZE,
  ARENA_TIER_TEXTURE_SIZE,
  ARENA_WALL_TEXTURE_HEIGHT,
  ARENA_WALL_TEXTURE_WIDTH,
  FRESCO_FIGURE_HEIGHT_PX,
  FRESCO_FIGURE_WIDTH_PX,
  PODIUM_BLOCK_WIDTH_MAX_PX,
  PODIUM_BLOCK_WIDTH_MIN_PX,
  applyArenaTextureAnisotropy,
  getArenaLinenTexture,
  getArenaRingPaintTexture,
  getArenaSandTexture,
  getArenaTierTexture,
  getPodiumInscriptionTexture,
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
/** One fake document for the whole file: the getters cache per session. */
const textureDoc = fakeDocument();

describe('AI-1 §B — dimensions, colour space and one cached instance each', () => {
  const { doc } = textureDoc;

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
    // No texture is painted twice: four canvases for four getters.
    expect(textureDoc.canvases.length).toBe(4);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('AI-1 §C — one generator, not two', () => {
  test('the module has exactly ONE canvas factory and ONE CanvasTexture', () => {
    expect((MODULE_CODE.match(/createElement\('canvas'\)/g) ?? []).length).toBe(1);
    expect((MODULE_CODE.match(/new THREE\.CanvasTexture\(/g) ?? []).length).toBe(1);
    expect((MODULE_CODE.match(/function paintArenaTexture\(/g) ?? []).length).toBe(1);
    // Every texture goes through it: six getters, six calls.
    expect((MODULE_CODE.match(/paintArenaTexture\(/g) ?? []).length).toBe(7); // 1 definition + 6 calls
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
    expect(values).toHaveLength(16);
    for (const value of values) expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(ARENA_SAND_PIT_RADIUS).toBe(20);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('AI-2 §E — the velarium linen and the podium inscription', () => {
  const { doc, canvases } = textureDoc;

  test('the linen is a 1024×256 canvas in the two pinned tones', () => {
    const linen = getArenaLinenTexture({ document: doc });
    expect(linen).not.toBeNull();
    expect((linen as THREE.CanvasTexture).image.width).toBe(ARENA_LINEN_TEXTURE_WIDTH);
    expect((linen as THREE.CanvasTexture).image.height).toBe(ARENA_LINEN_TEXTURE_HEIGHT);
    expect(ARENA_LINEN_TEXTURE_WIDTH).toBe(1024);
    expect(ARENA_LINEN_TEXTURE_HEIGHT).toBe(256);
    expect(ARENA_LINEN_STRIPE_PITCH).toBe(64);
    expect(ARENA_INTERIOR_COLORS.linen).toBe('#E7DCC4');
    expect(ARENA_INTERIOR_COLORS.linenStripe).toBe('#D9C9A8');
    // Wrapping once round the awning, sRGB like every other map here.
    expect((linen as THREE.CanvasTexture).wrapS).toBe(THREE.RepeatWrapping);
    expect((linen as THREE.CanvasTexture).wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect((linen as THREE.CanvasTexture).colorSpace).toBe(THREE.SRGBColorSpace);
    expect((linen as THREE.CanvasTexture).name).toBe('arena-velarium-linen');
  });

  test('the inscription is a 1024×128 canvas on the travertine tone', () => {
    const inscription = getPodiumInscriptionTexture({ document: doc });
    expect(inscription).not.toBeNull();
    expect((inscription as THREE.CanvasTexture).image.width).toBe(ARENA_INSCRIPTION_TEXTURE_WIDTH);
    expect((inscription as THREE.CanvasTexture).image.height).toBe(ARENA_INSCRIPTION_TEXTURE_HEIGHT);
    expect(ARENA_INSCRIPTION_TEXTURE_WIDTH).toBe(1024);
    expect(ARENA_INSCRIPTION_TEXTURE_HEIGHT).toBe(128);
    expect(ARENA_INTERIOR_COLORS.travertine).toBe(ROMAN_PALETTE.travertine.color);
    expect((inscription as THREE.CanvasTexture).name).toBe('arena-podium-inscription');
    // Abstract chisel marks, never text: the painter draws strokes only.
    const painter = MODULE_CODE.slice(MODULE_CODE.indexOf('function paintPodiumInscription'));
    expect(painter).toContain('strokeRect(');
    expect(painter).not.toContain('fillText');
    expect(painter).not.toContain('strokeText');
  });

  test('both new getters are cached exactly like the shipped four', () => {
    expect(getArenaLinenTexture({ document: doc })).toBe(getArenaLinenTexture({ document: doc }));
    expect(getPodiumInscriptionTexture({ document: doc })).toBe(
      getPodiumInscriptionTexture({ document: doc }),
    );
    // Six textures, six canvases across the whole session — none painted twice.
    expect(canvases.length).toBe(6);
  });

  test('A6 — anisotropy reaches all six textures, capped at 8', () => {
    applyArenaTextureAnisotropy({ capabilities: { getMaxAnisotropy: () => 16 } });
    for (const texture of [
      getArenaSandTexture({ document: doc }),
      getArenaRingPaintTexture({ document: doc }),
      getPodiumWallTexture({ document: doc }),
      getArenaTierTexture({ document: doc }),
      getArenaLinenTexture({ document: doc }),
      getPodiumInscriptionTexture({ document: doc }),
    ]) {
      expect((texture as THREE.CanvasTexture).anisotropy).toBe(8);
    }
    // A weaker renderer's own cap is honoured rather than overridden.
    applyArenaTextureAnisotropy({ capabilities: { getMaxAnisotropy: () => 4 } });
    expect((getArenaSandTexture({ document: doc }) as THREE.CanvasTexture).anisotropy).toBe(4);

    // The module stays import-safe: one line per texture, applied by a call.
    expect((MODULE_CODE.match(/\.anisotropy = max;/g) ?? []).length).toBe(6);
    expect(MODULE_CODE).toContain('Math.min(8, renderer.capabilities.getMaxAnisotropy())');
    const body = MODULE_CODE.slice(MODULE_CODE.indexOf('export function applyArenaTextureAnisotropy'));
    expect(body.indexOf('getMaxAnisotropy')).toBeGreaterThan(-1);
    // …and nothing runs it at module load: the name appears once, as its own
    // declaration, and never as a call in this module.
    expect((MODULE_CODE.match(/applyArenaTextureAnisotropy/g) ?? []).length).toBe(1);
  });

  test('A3/A4 — the repaint proportions are the brief’s, in world units', () => {
    // The wall map: 2048 px round a 20.2-radius drum, 512 px over 5.0 units.
    const unitsPerPxAcross = (2 * Math.PI * 20.2) / ARENA_WALL_TEXTURE_WIDTH;
    const unitsPerPxUp = 5.0 / ARENA_WALL_TEXTURE_HEIGHT;

    // A3 — natural human proportion: world height : width ≈ 2.4 : 1.
    expect(FRESCO_FIGURE_HEIGHT_PX).toBe(107);
    expect(FRESCO_FIGURE_WIDTH_PX).toBe(7);
    const figureWidth = FRESCO_FIGURE_WIDTH_PX * unitsPerPxAcross;
    const figureHeight = FRESCO_FIGURE_HEIGHT_PX * unitsPerPxUp;
    expect(figureHeight / figureWidth).toBeCloseTo(2.4, 1);
    // The shipped silhouette's 6.4:1 stretch is gone (it read ~4.4:1 wide).
    expect(figureHeight).toBeLessThan(figureWidth * 3);

    // A4 — block courses read 3…6 world units wide, not 12…26.
    expect(PODIUM_BLOCK_WIDTH_MIN_PX).toBe(48);
    expect(PODIUM_BLOCK_WIDTH_MAX_PX).toBe(97);
    expect(PODIUM_BLOCK_WIDTH_MIN_PX * unitsPerPxAcross).toBeCloseTo(3, 1);
    expect(PODIUM_BLOCK_WIDTH_MAX_PX * unitsPerPxAcross).toBeCloseTo(6, 1);
    const blockWidths = MODULE_CODE.slice(MODULE_CODE.indexOf('function blockWidths'));
    expect(blockWidths).toContain('PODIUM_BLOCK_WIDTH_MIN_PX');
    expect(blockWidths).not.toContain('190');
  });
});
