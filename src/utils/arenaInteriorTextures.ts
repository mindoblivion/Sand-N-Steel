/**
 * ===========================================================================
 * AI-1 — THE ARENA INTERIOR'S CANVAS-TEXTURE FACTORY
 * ===========================================================================
 * The duel arena's three flat zones (sand, podium wall, cavea tiers) and the
 * combat ring's worn paint are painted here, procedurally, at load time —
 * no asset files, no network cost.
 *
 * ── ONE GENERATOR ────────────────────────────────────────────────────────
 * There is exactly ONE canvas factory in this module — `paintArenaTexture` —
 * and all four textures come out of it. Nothing here creates a canvas any
 * other way, and no other module paints arena sand: the A3 "ground-texture
 * factory" this slice was asked to build on does not exist in the tree, so the
 * same shape is implemented locally (a cached getter per texture, each one a
 * painter function handed to the single factory).
 *
 * ── IMPORT-SAFE (the guarded pattern) ────────────────────────────────────
 * Nothing runs at module load and nothing above a call touches `document`.
 * Every getter returns `null` when there is no canvas to paint (no document,
 * no 2D context, any throw while drawing), exactly like
 * `utils/victoryCardPainter.ts`. A `null` texture simply means the arena's
 * material keeps its flat colour. The one exception is the colour table below,
 * which is plain data.
 *
 * ── CACHED ───────────────────────────────────────────────────────────────
 * Each texture is generated once per session and shared by every mount; the
 * getters are idempotent and return the same THREE.CanvasTexture instance.
 *
 * ── COLOURS ──────────────────────────────────────────────────────────────
 * Only the atmosphere palette. The brief gives hexes for ArenaSand, the two
 * rake tones, CypressGreen and GoldTrim; the palette names it leaves without a
 * hex (Travertine, Limestone, PaintRussata, PaintVeneta, Bone, BronzeAged) are
 * resolved from constants this codebase already ships — `ROMAN_PALETTE`'s
 * travertine/travertineDark/roadKerb/glazedLapis/agedBronze/recessDark rows,
 * the arena ring's own #991b1b and the loge columns' bone #f5ede0. No new hex
 * value is invented anywhere in this module.
 *
 * ── WHAT IS NOT UNIT-TESTED ──────────────────────────────────────────────
 * Dimensions, colour values, caching and the single-factory rule are tested
 * (`arenaInteriorTextures.test.ts`). The pixels themselves are S24-accepted on
 * a device — a sandbox with no GPU cannot judge a rake pattern.
 */
import * as THREE from 'three';
import { ROMAN_PALETTE } from '../components/3d/city/RomanMaterials';

/** The sand disc: one square texture mapped onto the pit's inscribed circle. */
export const ARENA_SAND_TEXTURE_SIZE = 1024;
/** The podium wall: 360° of circumference by 5.0 units of height. */
export const ARENA_WALL_TEXTURE_WIDTH = 2048;
export const ARENA_WALL_TEXTURE_HEIGHT = 512;
/** The cavea: shared by both tier cones. */
export const ARENA_TIER_TEXTURE_SIZE = 1024;
/** The combat ring's chipped-paint alpha map. */
export const ARENA_RING_ALPHA_SIZE = 512;

/** The ring mesh's own radii — the alpha map is an annulus in its UV space. */
export const ARENA_RING_INNER_RADIUS = 7.8;
export const ARENA_RING_OUTER_RADIUS = 8.2;

/** Sand pit radius in world units (the circle geometry's radius). */
export const ARENA_SAND_PIT_RADIUS = 20;

export const ARENA_INTERIOR_COLORS = {
  /** ArenaSand — the brief's base sand. */
  sand: '#D6B878',
  /** Rake shadow — the groove each harrow pass leaves. */
  rakeShadow: '#B9955A',
  /** Fresh rake — the pale arcs of the last, wall-side passes. */
  freshRake: '#E4CC96',
  /** Travertine — ROMAN_PALETTE.travertine. */
  travertine: ROMAN_PALETTE.travertine.color,
  /** Travertine shadow — ROMAN_PALETTE.travertineDark (joints, value jitter). */
  travertineDark: ROMAN_PALETTE.travertineDark.color,
  /** Limestone — ROMAN_PALETTE.roadKerb, the palette's limestone tone. */
  limestone: ROMAN_PALETTE.roadKerb.color,
  /** PaintRussata — the ring's own red. */
  paintRussata: '#991b1b',
  /** PaintVeneta — ROMAN_PALETTE.glazedLapis, the palette's blue. */
  paintVeneta: ROMAN_PALETTE.glazedLapis.color,
  /** Bone — the imperial loge columns' bone marble: the fresco silhouettes. */
  bone: '#f5ede0',
  /** BronzeAged — ROMAN_PALETTE.agedBronze: chains and the Libitinaria plaque. */
  bronzeAged: ROMAN_PALETTE.agedBronze.color,
  /** Damp — ROMAN_PALETTE.recessDark: the wall's dark base band. */
  damp: ROMAN_PALETTE.recessDark.color,
  /** CypressGreen — the Triumphalis laurel. */
  cypressGreen: '#2E4630',
  /** GoldTrim — the Triumphalis boss disc. */
  goldTrim: '#C9A227',
  /** Dark iron — the portcullis bars (the shipped gate steel). */
  iron: '#292524',
} as const;

export type ArenaInteriorColorName = keyof typeof ARENA_INTERIOR_COLORS;

/** Injected for tests; a real session never passes one. */
export interface ArenaTextureOptions {
  document?: Document | null;
}

type Painter = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;

/** Deterministic PRNG (mulberry32) so a texture looks the same on every load. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * THE factory. Every arena texture is one call to this: allocate a canvas, run
 * the painter, wrap it in a `CanvasTexture`. Returns `null` — never throws —
 * when there is no canvas, no 2D context, or drawing fails.
 */
function paintArenaTexture(
  width: number,
  height: number,
  painter: Painter,
  options: ArenaTextureOptions = {},
): THREE.CanvasTexture | null {
  try {
    const doc =
      'document' in options
        ? options.document ?? null
        : typeof document === 'undefined'
          ? null
          : document;
    const canvas =
      doc && typeof doc.createElement === 'function'
        ? (doc.createElement('canvas') as HTMLCanvasElement)
        : null;
    if (!canvas) return null;
    const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    if (!ctx) return null;

    canvas.width = width;
    canvas.height = height;
    painter(ctx, width, height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.repeat.set(1, 1);
    return texture;
  } catch {
    return null;
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   1. SAND — rake rings around the pit, a churned centre, fresh arcs at the
      wall. Pit-shaped: clamped edges and repeat 1, so nothing tiles.
   ───────────────────────────────────────────────────────────────────────── */
function paintSand(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const rand = seeded(0x5a4d);
  const cx = width / 2;
  const cy = height / 2;
  const outer = width / 2;
  // The churned centre: radius ~8 world units of a 20-unit pit.
  const churnRadius = (8 / ARENA_SAND_PIT_RADIUS) * outer;

  ctx.globalAlpha = 1;
  ctx.fillStyle = ARENA_INTERIOR_COLORS.sand;
  ctx.fillRect(0, 0, width, height);

  // Grain: dark and pale stipple over the whole pit.
  ctx.fillStyle = ARENA_INTERIOR_COLORS.rakeShadow;
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 9000; i += 1) {
    ctx.beginPath();
    ctx.arc(rand() * width, rand() * height, 0.5 + rand() * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = ARENA_INTERIOR_COLORS.freshRake;
  ctx.globalAlpha = 0.1;
  for (let i = 0; i < 7000; i += 1) {
    ctx.beginPath();
    ctx.arc(rand() * width, rand() * height, 0.5 + rand() * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // The churned, fought-over centre: darker scuff blotches fading outward.
  for (let i = 0; i < 150; i += 1) {
    const angle = rand() * Math.PI * 2;
    const radius = Math.sqrt(rand()) * churnRadius;
    const fade = 1 - radius / churnRadius;
    ctx.globalAlpha = 0.04 + 0.14 * fade;
    ctx.fillStyle = ARENA_INTERIOR_COLORS.rakeShadow;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, 6 + rand() * 26, 0, Math.PI * 2);
    ctx.fill();
  }
  // …and the kicked-up stipple inside it, thinning as it goes out.
  for (let i = 0; i < 3200; i += 1) {
    const angle = rand() * Math.PI * 2;
    const radius = Math.sqrt(rand()) * churnRadius;
    const fade = 1 - radius / churnRadius;
    ctx.globalAlpha = 0.05 + 0.18 * fade;
    ctx.fillStyle = rand() > 0.5 ? ARENA_INTERIOR_COLORS.rakeShadow : ARENA_INTERIOR_COLORS.freshRake;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, 0.6 + rand() * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Concentric rake rings, hand-drawn in broken arcs. Near the wall the last
  // passes are fresh pale sand; inside they are the shadowed grooves.
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  for (let r = outer * 0.3; r < outer - 4; r += 18) {
    const nearWall = r > outer * 0.78;
    ctx.strokeStyle = nearWall
      ? ARENA_INTERIOR_COLORS.freshRake
      : ARENA_INTERIOR_COLORS.rakeShadow;
    ctx.globalAlpha = nearWall ? 0.2 : 0.13;
    const segments = 6 + Math.floor(rand() * 5);
    let angle = rand() * Math.PI * 2;
    for (let s = 0; s < segments; s += 1) {
      const span = ((Math.PI * 2) / segments) * (0.55 + rand() * 0.4);
      ctx.beginPath();
      ctx.arc(cx, cy, r, angle, angle + span);
      ctx.stroke();
      angle += (Math.PI * 2) / segments;
    }
  }

  ctx.globalAlpha = 1;
}

/* ─────────────────────────────────────────────────────────────────────────
   2. THE RING'S CHIPPED PAINT — a white annulus on black. The ring geometry's
      UVs span the outer radius, so the band sits between inner/outer.
   ───────────────────────────────────────────────────────────────────────── */
function paintRingPaint(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const rand = seeded(0x21c1);
  const cx = width / 2;
  const cy = height / 2;
  const outer = width / 2;
  const inner = (ARENA_RING_INNER_RADIUS / ARENA_RING_OUTER_RADIUS) * outer;

  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  // The painted band itself.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = outer - inner;
  ctx.beginPath();
  ctx.arc(cx, cy, (inner + outer) / 2, 0, Math.PI * 2);
  ctx.stroke();

  // Chips and scuffs: black bites out of the band, of every length.
  ctx.strokeStyle = '#000000';
  ctx.lineCap = 'round';
  for (let i = 0; i < 120; i += 1) {
    const angle = rand() * Math.PI * 2;
    const span = 0.01 + rand() * 0.12;
    ctx.globalAlpha = 0.55 + rand() * 0.45;
    ctx.lineWidth = (outer - inner) * (0.2 + rand() * 0.9);
    ctx.beginPath();
    ctx.arc(cx, cy, (inner + outer) / 2, angle, angle + span);
    ctx.stroke();
  }
  // Fine speckle so the surviving paint is not a perfect stripe.
  ctx.globalAlpha = 0.6;
  for (let i = 0; i < 260; i += 1) {
    const angle = rand() * Math.PI * 2;
    const radius = inner + rand() * (outer - inner);
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, 0.8 + rand() * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

/* ─────────────────────────────────────────────────────────────────────────
   3. THE PODIUM WALL — travertine courses, a fresco band, a limestone plinth
      and the damp band at the foot. Canvas y=0 is the wall's TOP (flipY), so
      the fresco sits at low y and the plinth at high y. Two block patterns,
      each summing to the full width, keep the 360° seam closed.
   ───────────────────────────────────────────────────────────────────────── */
function blockWidths(rand: () => number, width: number): number[] {
  const widths: number[] = [];
  let remaining = width;
  while (remaining > 0) {
    const w = Math.min(remaining, 190 + rand() * 230);
    widths.push(w);
    remaining -= w;
  }
  return widths;
}

function paintPodiumWall(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const rand = seeded(0x3a11);
  const color = ARENA_INTERIOR_COLORS;
  const bottom = (px: number) => height - px; // px measured up from the wall's foot

  ctx.globalAlpha = 1;
  ctx.fillStyle = color.travertine;
  ctx.fillRect(0, 0, width, height);

  // Band layout, bottom-up from the foot: damp 0–30, plinth 30–90, courses
  // 90–360, fresco 362–482 (canvas y 30–150), attic course at the top.
  const courseTop = bottom(360); // canvas y of the courses' top edge
  const courseBottom = bottom(90);
  const courseH = 54;
  const patterns = [blockWidths(rand, width), blockWidths(rand, width)];

  // TRAVERTINE BLOCK COURSES, with drawn joints and per-block value jitter.
  for (let y = courseTop, row = 0; y < courseBottom; y += courseH, row += 1) {
    const widths = patterns[row % patterns.length];
    let x = 0;
    for (let b = 0; b < widths.length; b += 1) {
      const w = widths[b];
      // Value jitter: every block a little different, some markedly darker.
      ctx.fillStyle = color.travertineDark;
      ctx.globalAlpha = rand() > 0.82 ? 0.16 + rand() * 0.14 : rand() * 0.1;
      ctx.fillRect(x, y, w, courseH);
      // Drawn joints: vertical at each block edge, horizontal at the course bed.
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = color.travertineDark;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, y);
      ctx.lineTo(x + 0.5, y + courseH);
      ctx.stroke();
      x += w;
    }
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = color.travertineDark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
    ctx.stroke();
  }

  // LIMESTONE PLINTH COURSE at the foot, jointed in step with the blocks.
  const plinthTop = bottom(90);
  ctx.globalAlpha = 1;
  ctx.fillStyle = color.limestone;
  ctx.fillRect(0, plinthTop, width, bottom(30) - plinthTop);
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = color.travertineDark;
  ctx.lineWidth = 2;
  for (let x = 0; x <= width; x += width / 8) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, plinthTop);
    ctx.lineTo(x + 0.5, bottom(30));
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, plinthTop + 0.5);
  ctx.lineTo(width, plinthTop + 0.5);
  ctx.stroke();

  // DARK DAMP BAND at the very foot, fading upward into the plinth.
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = color.damp;
  ctx.fillRect(0, bottom(30), width, 30);
  ctx.globalAlpha = 0.22;
  ctx.fillRect(0, bottom(44), width, 14);

  // FRESCO BAND in the upper third: alternating Russata / Veneta panels on a
  // lime ground, each carrying a Bone-tone gladiator silhouette, worn at the
  // edges. Eight panels of equal width keep the ring's seam closed.
  const frescoTop = 30;
  const frescoBottom = 150;
  const frescoH = frescoBottom - frescoTop;
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = color.limestone;
  ctx.fillRect(0, frescoTop, width, frescoH);
  ctx.globalAlpha = 1;

  const panels = 8;
  const panelW = width / panels;
  for (let p = 0; p < panels; p += 1) {
    const px = p * panelW + 6;
    const pw = panelW - 12;
    const isRussata = p % 2 === 0;
    // The painted field, thin and faded like plaster that has held for years.
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = isRussata ? color.paintRussata : color.paintVeneta;
    ctx.fillRect(px, frescoTop + 6, pw, frescoH - 12);
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = isRussata ? color.paintVeneta : color.paintRussata;
    ctx.lineWidth = 3;
    ctx.strokeRect(px + 4.5, frescoTop + 10.5, pw - 9, frescoH - 21);

    // The silhouette: abstract fresco figure — head, torso, legs, a sword arm.
    const fx = px + pw / 2;
    const fy = frescoTop + 18;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = color.bone;
    ctx.strokeStyle = color.bone;
    ctx.beginPath();
    ctx.arc(fx, fy + 10, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(fx - 15, fy + 24);
    ctx.lineTo(fx + 15, fy + 24);
    ctx.lineTo(fx + 9, fy + 62);
    ctx.lineTo(fx - 9, fy + 62);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(fx, fy + 62);
    ctx.lineTo(fx - 11, fy + 92);
    ctx.moveTo(fx, fy + 62);
    ctx.lineTo(fx + 12, fy + 92);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(fx - 13, fy + 32);
    ctx.lineTo(fx - 27, fy + 52);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(fx - 27, fy + 52);
    ctx.lineTo(fx - 31, fy + 24);
    ctx.stroke();

    // Worn edges: the plaster has flaked back to stone along the panel edges.
    for (let i = 0; i < 46; i += 1) {
      const along = rand();
      const edge = Math.floor(rand() * 4);
      const bx =
        edge === 0 ? px + along * pw : edge === 1 ? px + pw - rand() * 10 : px + rand() * 10;
      const by =
        edge === 2
          ? frescoTop + 6 + along * (frescoH - 12)
          : edge === 3
            ? frescoBottom - 6 - rand() * 10
            : frescoTop + 6 + rand() * (frescoH - 12);
      ctx.globalAlpha = 0.14 + rand() * 0.26;
      ctx.fillStyle = color.travertine;
      ctx.beginPath();
      ctx.arc(bx, by, 2 + rand() * 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // A last stone grime pass so the whole wall reads as one damp surface.
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = color.travertineDark;
  for (let i = 0; i < 2600; i += 1) {
    ctx.beginPath();
    ctx.arc(rand() * width, rand() * height, 0.6 + rand() * 3.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

/* ─────────────────────────────────────────────────────────────────────────
   4. THE CAVEA — step nosings as horizontal bands (canvas y runs along the
      cone's height) and faint radial aisle shadows as vertical bands (canvas
      x runs around it). Limestone-to-travertine values; the second cone tints a
      copy of this texture darker through its material colour.
   ───────────────────────────────────────────────────────────────────────── */
function paintArenaTiers(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const rand = seeded(0x7701);
  const color = ARENA_INTERIOR_COLORS;

  ctx.globalAlpha = 1;
  ctx.fillStyle = color.limestone;
  ctx.fillRect(0, 0, width, height);

  // Step treads and their nosings.
  const step = height / 12;
  for (let y = 0; y < height; y += step) {
    ctx.globalAlpha = 0.45 + rand() * 0.3;
    ctx.fillStyle = color.travertine;
    ctx.fillRect(0, y, width, step - 7);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = color.travertineDark;
    ctx.fillRect(0, y + step - 7, width, 4);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = color.travertine;
    ctx.fillRect(0, y + step - 3, width, 3);
  }

  // Faint radial aisle shadows. Bands at x=0 are drawn wrapped as well so the
  // cylinder's 360° seam does not cut one in half.
  const aisles = 18;
  const aisleW = 14;
  for (let i = 0; i < aisles; i += 1) {
    const x = (i * width) / aisles;
    ctx.globalAlpha = 0.1 + rand() * 0.06;
    ctx.fillStyle = color.travertineDark;
    ctx.fillRect(x, 0, aisleW, height);
    ctx.fillRect(x - width, 0, aisleW, height);
  }

  // Grain.
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = color.travertineDark;
  for (let i = 0; i < 4200; i += 1) {
    ctx.beginPath();
    ctx.arc(rand() * width, rand() * height, 0.6 + rand() * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

/* ─────────────────────────────────────────────────────────────────────────
   The cached getters — one texture each, generated once per session.
   ───────────────────────────────────────────────────────────────────────── */
let sandTexture: THREE.CanvasTexture | null = null;
let ringPaintTexture: THREE.CanvasTexture | null = null;
let podiumWallTexture: THREE.CanvasTexture | null = null;
let arenaTierTexture: THREE.CanvasTexture | null = null;

/** Sand: the pit's own 1024² rake pattern. Clamped — it never tiles. */
export function getArenaSandTexture(options?: ArenaTextureOptions): THREE.CanvasTexture | null {
  if (sandTexture) return sandTexture;
  const texture = paintArenaTexture(ARENA_SAND_TEXTURE_SIZE, ARENA_SAND_TEXTURE_SIZE, paintSand, options);
  if (texture) {
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.name = 'arena-sand';
    sandTexture = texture;
  }
  return texture;
}

/** The combat ring's chipped paint, as an alpha map. */
export function getArenaRingPaintTexture(options?: ArenaTextureOptions): THREE.CanvasTexture | null {
  if (ringPaintTexture) return ringPaintTexture;
  const texture = paintArenaTexture(ARENA_RING_ALPHA_SIZE, ARENA_RING_ALPHA_SIZE, paintRingPaint, options);
  if (texture) {
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.name = 'arena-ring-paint';
    ringPaintTexture = texture;
  }
  return texture;
}

/** The podium wall: 2048×512, wrapping once around the 360° drum. */
export function getPodiumWallTexture(options?: ArenaTextureOptions): THREE.CanvasTexture | null {
  if (podiumWallTexture) return podiumWallTexture;
  const texture = paintArenaTexture(
    ARENA_WALL_TEXTURE_WIDTH,
    ARENA_WALL_TEXTURE_HEIGHT,
    paintPodiumWall,
    options,
  );
  if (texture) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.name = 'arena-podium-wall';
    podiumWallTexture = texture;
  }
  return texture;
}

/** The cavea: one texture shared by both tier cones. */
export function getArenaTierTexture(options?: ArenaTextureOptions): THREE.CanvasTexture | null {
  if (arenaTierTexture) return arenaTierTexture;
  const texture = paintArenaTexture(ARENA_TIER_TEXTURE_SIZE, ARENA_TIER_TEXTURE_SIZE, paintArenaTiers, options);
  if (texture) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.name = 'arena-tiers';
    arenaTierTexture = texture;
  }
  return texture;
}
