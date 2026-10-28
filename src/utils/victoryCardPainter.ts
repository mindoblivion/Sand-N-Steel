/**
 * ===========================================================================
 * PITCH A6 — THE VICTORY CARD'S THIN CANVAS PAINTER
 * ===========================================================================
 * One fixed template, one entry point: `paintVictoryCard(data)`.
 *
 * Import-safe by construction: NOTHING here runs at module load, and nothing
 * touches `document`/`window` above the call.  When there is no canvas to paint
 * (server render, a browser with no 2D context, or any throw while drawing) the
 * painter returns `null`, and the result screen simply shows no poster.
 *
 * ── R-SIZE (Director ruling) ─────────────────────────────────────────────
 * The brief pins a "fixed template", not dimensions; 1080 x 1350 is the
 * standard shareable poster ratio, so the template is authored in that design
 * space and the backing store is scaled by the device pixel ratio.  The ratio
 * is CAPPED at 2: a 3x store is 3240 x 4050 (~52 MB of pixels) and phones with
 * a 3x panel are exactly the devices that cannot afford it.
 *
 * ── R-COLOUR (Director ruling) ───────────────────────────────────────────
 * No faction system exists in this game, so none is invented.  Each frame is
 * coloured from the SHIPPED A1 atmosphere palette (`PHASE_LIGHT`, the same
 * constants the arenas light themselves with), as authored here:
 *   • Victory  — the `goldenHour` anchor row (`PHASE_LIGHT.golden`): its sky
 *                tint, its ember horizon and its sun glow.
 *   • Defeat   — the muted dusk steel of the `dusk` row: its zenith, its
 *                mauve mid band and its steel hemisphere sky.
 *   • Champion — gilded: the `goldenHour` row's own horizon gold and sun glow
 *                carrying a bright field, with the row's zenith as the ink.
 * The deep base and the parchment/dark inks are authored neutrals for
 * legibility; everything that names a frame is a shipped atmosphere value.
 *
 * ── THE STATED RISK ──────────────────────────────────────────────────────
 * Canvas typography varies across Android devices (font availability and
 * metric rounding), and pixel output is not unit-tested: acceptance is Walter's
 * S24.  So the painter stays thin, every text run is measured and fitted to its
 * box, and every unusual API is feature-checked rather than assumed.
 */

import { PHASE_LIGHT } from './atmosphere';
import {
  VICTORY_CARD_FRAME_LABEL,
  type VictoryCardData,
  type VictoryCardFrame,
} from './victoryCard';

/** R-SIZE — the fixed template's design space. */
export const VICTORY_CARD_WIDTH = 1080;
export const VICTORY_CARD_HEIGHT = 1350;
/** Mobile memory guard (see the header): never back a 3x store. */
export const VICTORY_CARD_MAX_DPR = 2;

/** Authored neutral base under every frame — not a shipped palette value. */
const BASE_DEEP = '#0B0806';
/** The serif / mono voices.  Plain families only: a webfont never loads here. */
const SERIF_FAMILY = "Georgia, 'Times New Roman', 'Noto Serif', serif";
const MONO_FAMILY = "'Courier New', 'Roboto Mono', monospace";

/** One frame's authored colour mapping onto the shipped atmosphere rows. */
export interface VictoryCardPalette {
  /** Backdrop gradient, top → bottom. */
  fieldTop: string;
  fieldBottom: string;
  /** The frame's word, its rules and its diamonds. */
  accent: string;
  /** The soft light behind the crest. */
  glow: string;
  /** Primary ink: the player's name and the figures. */
  ink: string;
  /** Secondary ink: labels and the footer. */
  inkMuted: string;
  /** The panel behind the figures. */
  panel: string;
}

/** Multiply a `#rrggbb` colour's channels — keeps a shipped hue, darkens it. */
function shade(hex: string, factor: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  const value = parseInt(match[1], 16);
  const channel = (shift: number) =>
    Math.max(0, Math.min(255, Math.round(((value >> shift) & 0xff) * factor)));
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, '0')}`;
}

/** A shipped colour at an alpha, for rules, panels and glows. */
function alpha(hex: string, opacity: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, opacity))})`;
}

/**
 * R-COLOUR, as shipped.  Every named colour below is a `PHASE_LIGHT` value
 * (see the file header's mapping); only `BASE_DEEP`, the inks and the shadow
 * alphas are authored neutrals.
 */
export const VICTORY_CARD_PALETTES: Record<VictoryCardFrame, VictoryCardPalette> = {
  // Victory — the goldenHour anchor row: navy zenith, ember horizon, sun glow.
  victory: {
    fieldTop: shade(PHASE_LIGHT.golden.skyZenith, 0.5),
    fieldBottom: shade(PHASE_LIGHT.golden.fogColor, 0.24),
    accent: PHASE_LIGHT.golden.sunGlow,
    glow: PHASE_LIGHT.golden.sunColor,
    ink: PHASE_LIGHT.golden.fogColor,
    inkMuted: alpha(PHASE_LIGHT.golden.fogColor, 0.72),
    panel: alpha(PHASE_LIGHT.golden.hemiGround, 0.16),
  },
  // Defeat — the dusk row's muted steel: deep zenith, mauve mid, steel hemi sky.
  defeat: {
    fieldTop: shade(PHASE_LIGHT.dusk.skyZenith, 0.62),
    fieldBottom: shade(PHASE_LIGHT.dusk.skyMid, 0.32),
    accent: PHASE_LIGHT.dusk.hemiSky,
    glow: PHASE_LIGHT.dusk.fogColor,
    ink: PHASE_LIGHT.midday.fogColor,
    inkMuted: alpha(PHASE_LIGHT.midday.fogColor, 0.66),
    panel: alpha(PHASE_LIGHT.dusk.skyZenith, 0.55),
  },
  // Champion — gilded: the goldenHour row's horizon gold carries the field,
  // its sun glow the light, and its zenith the ink.
  champion: {
    fieldTop: PHASE_LIGHT.golden.skyHorizon,
    fieldBottom: shade(PHASE_LIGHT.golden.sunColor, 0.82),
    accent: shade(PHASE_LIGHT.golden.hemiGround, 0.45),
    glow: PHASE_LIGHT.golden.sunGlow,
    ink: shade(PHASE_LIGHT.golden.skyZenith, 0.24),
    inkMuted: shade(PHASE_LIGHT.golden.hemiGround, 0.5),
    panel: alpha(PHASE_LIGHT.golden.sunGlow, 0.45),
  },
};

/** Options for `paintVictoryCard` — everything injectable is injectable on purpose. */
export interface PaintVictoryCardOptions {
  /** The canvas to paint into.  Created from `document` when absent. */
  canvas?: HTMLCanvasElement | null;
  /** The document that creates a canvas when none is supplied. */
  document?: Document | null;
  /** The pixel ratio to honour; defaults to the live window's. */
  devicePixelRatio?: number;
}

type Ctx = CanvasRenderingContext2D;

/** Letter-spacing is Chrome-only; anywhere else the run is drawn untracked. */
function setTracking(ctx: Ctx, px: number): void {
  const spaced = ctx as Ctx & { letterSpacing?: string };
  if ('letterSpacing' in spaced) spaced.letterSpacing = `${px}px`;
}

/** The largest size (down from `base`) at which `text` fits `maxWidth`. */
function fitFontSize(
  ctx: Ctx,
  text: string,
  maxWidth: number,
  base: number,
  font: (size: number) => string,
  floor = 22,
): number {
  let size = base;
  for (;;) {
    ctx.font = font(size);
    if (ctx.measureText(text).width <= maxWidth || size <= floor) return size;
    size -= 2;
  }
}

function drawPoster(ctx: Ctx, data: VictoryCardData): void {
  const palette = VICTORY_CARD_PALETTES[data.frame] ?? VICTORY_CARD_PALETTES.victory;
  const centerX = VICTORY_CARD_WIDTH / 2;

  // ── the field: a deep base, the frame's own atmosphere over it ──────────
  ctx.fillStyle = BASE_DEEP;
  ctx.fillRect(0, 0, VICTORY_CARD_WIDTH, VICTORY_CARD_HEIGHT);
  const field = ctx.createLinearGradient(0, 0, 0, VICTORY_CARD_HEIGHT);
  field.addColorStop(0, palette.fieldTop);
  field.addColorStop(0.55, alpha(palette.fieldBottom, 0.92));
  field.addColorStop(1, BASE_DEEP);
  ctx.fillStyle = field;
  ctx.fillRect(0, 0, VICTORY_CARD_WIDTH, VICTORY_CARD_HEIGHT);

  // The sun on the sand: one soft glow behind the crest.
  const glow = ctx.createRadialGradient(centerX, 300, 40, centerX, 300, 520);
  glow.addColorStop(0, alpha(palette.glow, 0.3));
  glow.addColorStop(1, alpha(palette.glow, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, VICTORY_CARD_WIDTH, 900);

  // ── the frame: a double rule, then a hairline ───────────────────────────
  ctx.strokeStyle = alpha(palette.accent, 0.8);
  ctx.lineWidth = 3;
  ctx.strokeRect(36, 36, VICTORY_CARD_WIDTH - 72, VICTORY_CARD_HEIGHT - 72);
  ctx.strokeStyle = alpha(palette.accent, 0.45);
  ctx.lineWidth = 1;
  ctx.strokeRect(50, 50, VICTORY_CARD_WIDTH - 100, VICTORY_CARD_HEIGHT - 100);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // ── the crest line ──────────────────────────────────────────────────────
  ctx.fillStyle = palette.inkMuted;
  ctx.font = `700 26px ${MONO_FAMILY}`;
  setTracking(ctx, 9);
  ctx.fillText('SAND & STEEL', centerX, 122);
  ctx.font = `400 20px ${MONO_FAMILY}`;
  setTracking(ctx, 6);
  ctx.fillText('ARENA RECORD', centerX, 158);
  setTracking(ctx, 0);

  // ── the frame's word ────────────────────────────────────────────────────
  ctx.fillStyle = palette.accent;
  ctx.font = `900 108px ${SERIF_FAMILY}`;
  setTracking(ctx, 10);
  ctx.fillText(VICTORY_CARD_FRAME_LABEL[data.frame] ?? 'VICTORY', centerX, 312);
  setTracking(ctx, 0);

  // ── the player and his class ────────────────────────────────────────────
  const nameSize = fitFontSize(
    ctx,
    data.playerName,
    880,
    78,
    (size) => `700 ${size}px ${SERIF_FAMILY}`,
    34,
  );
  ctx.font = `700 ${nameSize}px ${SERIF_FAMILY}`;
  ctx.fillStyle = palette.ink;
  ctx.fillText(data.playerName, centerX, 428);

  ctx.font = `600 32px ${MONO_FAMILY}`;
  ctx.fillStyle = palette.accent;
  setTracking(ctx, 8);
  ctx.fillText(data.className.toUpperCase(), centerX, 486);
  setTracking(ctx, 0);

  // ── the rule, with its diamond ──────────────────────────────────────────
  ctx.strokeStyle = alpha(palette.accent, 0.6);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(260, 540);
  ctx.lineTo(centerX - 26, 540);
  ctx.moveTo(centerX + 26, 540);
  ctx.lineTo(820, 540);
  ctx.stroke();
  ctx.fillStyle = palette.accent;
  ctx.beginPath();
  ctx.moveTo(centerX, 528);
  ctx.lineTo(centerX + 12, 540);
  ctx.lineTo(centerX, 552);
  ctx.lineTo(centerX - 12, 540);
  ctx.closePath();
  ctx.fill();

  // ── the rival ───────────────────────────────────────────────────────────
  ctx.fillStyle = palette.inkMuted;
  ctx.font = `400 22px ${MONO_FAMILY}`;
  setTracking(ctx, 8);
  ctx.fillText('AGAINST', centerX, 606);
  setTracking(ctx, 0);
  const rivalSize = fitFontSize(
    ctx,
    data.opponentName,
    860,
    54,
    (size) => `700 ${size}px ${SERIF_FAMILY}`,
    26,
  );
  ctx.font = `700 ${rivalSize}px ${SERIF_FAMILY}`;
  ctx.fillStyle = palette.ink;
  ctx.fillText(data.opponentName, centerX, 664);

  // ── the figures: result, crowd peak, and the margin when it exists ──────
  const rows: Array<[string, string]> = [
    ['RESULT', data.result.toUpperCase()],
    ['CROWD PEAK', `${data.peakHype}%`],
  ];
  // R-MARGIN: no transient reading → no margin row at all.
  if (data.margin !== undefined) rows.push(['WINNER HEALTH', data.margin]);

  const rowHeight = 96;
  const panelBottom = 1170;
  const panelHeight = rows.length * rowHeight + 90;
  const panelTop = panelBottom - panelHeight;
  const panelLeft = 120;
  const panelWidth = VICTORY_CARD_WIDTH - panelLeft * 2;

  ctx.fillStyle = palette.panel;
  roundRect(ctx, panelLeft, panelTop, panelWidth, panelHeight, 26);
  ctx.fill();
  ctx.strokeStyle = alpha(palette.accent, 0.45);
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  rows.forEach(([label, value], index) => {
    const y = panelTop + 45 + rowHeight / 2 + index * rowHeight;
    ctx.font = `400 26px ${MONO_FAMILY}`;
    ctx.fillStyle = palette.inkMuted;
    setTracking(ctx, 4);
    ctx.fillText(label, panelLeft + 44, y);
    setTracking(ctx, 0);
    ctx.textAlign = 'right';
    ctx.font = `700 46px ${SERIF_FAMILY}`;
    ctx.fillStyle = palette.ink;
    ctx.fillText(value, panelLeft + panelWidth - 44, y);
    ctx.textAlign = 'left';
    if (index < rows.length - 1) {
      ctx.strokeStyle = alpha(palette.accent, 0.28);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(panelLeft + 44, y + rowHeight / 2);
      ctx.lineTo(panelLeft + panelWidth - 44, y + rowHeight / 2);
      ctx.stroke();
    }
  });

  // ── the foot ────────────────────────────────────────────────────────────
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = palette.inkMuted;
  ctx.font = `400 19px ${MONO_FAMILY}`;
  setTracking(ctx, 6);
  ctx.fillText('SAND & STEEL', centerX, 1252);
  setTracking(ctx, 0);
}

/** A rounded rectangle path — `roundRect` is not on every older canvas. */
function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const corner = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + corner, y);
  ctx.lineTo(x + w - corner, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + corner);
  ctx.lineTo(x + w, y + h - corner);
  ctx.quadraticCurveTo(x + w, y + h, x + w - corner, y + h);
  ctx.lineTo(x + corner, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - corner);
  ctx.lineTo(x, y + corner);
  ctx.quadraticCurveTo(x, y, x + corner, y);
  ctx.closePath();
}

/** The pixel ratio to honour, clamped to a sane range (see R-SIZE). */
function resolveRatio(devicePixelRatio: number | undefined): number {
  const raw =
    typeof devicePixelRatio === 'number' && Number.isFinite(devicePixelRatio)
      ? devicePixelRatio
      : typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio)
        ? window.devicePixelRatio
        : 1;
  return Math.max(1, Math.min(VICTORY_CARD_MAX_DPR, raw));
}

/**
 * Paint the fixed template.  Returns the painted canvas, or `null` when there is
 * no canvas or no 2D context — or if anything at all goes wrong while drawing.
 * Never throws: the result screen must always be able to keep working.
 */
export function paintVictoryCard(
  data: VictoryCardData,
  options: PaintVictoryCardOptions = {},
): HTMLCanvasElement | null {
  try {
    const doc =
      'document' in options
        ? options.document ?? null
        : typeof document === 'undefined'
          ? null
          : document;
    const canvas =
      options.canvas ?? (doc && typeof doc.createElement === 'function'
        ? (doc.createElement('canvas') as HTMLCanvasElement)
        : null);
    if (!canvas) return null;
    const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    if (!ctx) return null;

    const ratio = resolveRatio(options.devicePixelRatio);
    canvas.width = Math.round(VICTORY_CARD_WIDTH * ratio);
    canvas.height = Math.round(VICTORY_CARD_HEIGHT * ratio);
    if (typeof ctx.setTransform === 'function') ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    drawPoster(ctx, data);
    return canvas;
  } catch {
    return null;
  }
}
