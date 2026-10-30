/**
 * generateBrandAssets.ts — the WEB and STORE icons, from `resources/icon.png`.
 *
 * ── Why this script exists ───────────────────────────────────────────────
 * One piece of branding artwork now feeds four surfaces, and three of them are
 * generated rather than drawn by hand: the native launcher icons and splashes
 * (`@capacitor/assets`, from `resources/`), the PWA/manifest icons the browser and an
 * installed desktop app use (`public/icons/`), and the Play Console listing icon
 * (`store/play/`). Regenerating any of them by hand invites drift — a stale 192×192
 * next to a fresh 512 — so the web and store sets are produced here, mechanically,
 * from the same source file.
 *
 *   bun run brand:assets     # native (Android + iOS) AND these
 *   bun run scripts/generateBrandAssets.ts   # just public/icons/ + store/play/
 *
 * ── The rules each size follows ──────────────────────────────────────────
 *   • `icon-192` / `icon-512` — the artwork as drawn, cover-cropped.
 *   • `icon-maskable-512` — the mark at 80 % inside the safe zone on the manifest's
 *     own `background_color` (#0c0a09), so no launcher mask (circle, squircle,
 *     teardrop) can crop the logo. Full-bleed artwork is exactly what a maskable
 *     icon must NOT be.
 *   • `apple-touch-icon` — opaque, because iOS composites transparency onto black.
 *   • `store/play/icon-512` — opaque 512×512 RGB, which is what the Play Console
 *     listing asks for (its transparency warnings are avoidable; the manifest icon
 *     keeps its alpha for the maskable copy).
 *
 * The source is `resources/icon.png`: 1024×1024, the same file `@capacitor/assets`
 * reads, so the browser, the launcher, the splash and the listing cannot disagree.
 */

import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = `${ROOT}resources/icon.png`;

/** The manifest's `background_color` — what a maskable icon is padded onto. */
const BACKGROUND = { r: 12, g: 10, b: 9, alpha: 1 };

const out = (rel: string) => `${ROOT}${rel}`;

async function main(): Promise<void> {
  const meta = await sharp(SOURCE).metadata();
  if (!meta.width || !meta.height) throw new Error('resources/icon.png could not be read');
  if (meta.width !== meta.height) {
    throw new Error(`resources/icon.png must be square, got ${meta.width}×${meta.height}`);
  }
  if (meta.width < 1024) {
    throw new Error(`resources/icon.png must be at least 1024×1024, got ${meta.width}`);
  }

  // The two manifest sizes, as drawn.
  for (const size of [192, 512]) {
    await sharp(SOURCE)
      .resize(size, size, { fit: 'cover' })
      .png({ compressionLevel: 9 })
      .toFile(out(`public/icons/icon-${size}.png`));
  }

  // Maskable: 80 % of the canvas, centred, on the manifest background.
  const inner = await sharp(SOURCE)
    .resize(Math.round(512 * 0.8), Math.round(512 * 0.8), { fit: 'contain', background: { ...BACKGROUND, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: BACKGROUND } })
    .composite([{ input: inner, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(out('public/icons/icon-maskable-512.png'));

  // Apple touch icon: opaque.
  await sharp(SOURCE)
    .resize(180, 180, { fit: 'cover' })
    .flatten({ background: BACKGROUND })
    .png({ compressionLevel: 9 })
    .toFile(out('public/icons/apple-touch-icon.png'));

  // Play Console listing icon: opaque 512×512 RGB.
  await sharp(SOURCE)
    .resize(512, 512, { fit: 'cover' })
    .flatten({ background: BACKGROUND })
    .png({ compressionLevel: 9 })
    .toFile(out('store/play/icon-512.png'));

  for (const rel of [
    'public/icons/icon-192.png',
    'public/icons/icon-512.png',
    'public/icons/icon-maskable-512.png',
    'public/icons/apple-touch-icon.png',
    'store/play/icon-512.png',
  ]) {
    const written = await sharp(out(rel)).metadata();
    console.log(`${rel} — ${written.width}×${written.height}, alpha: ${written.hasAlpha ? 'yes' : 'no'}`);
  }
}

await main();
